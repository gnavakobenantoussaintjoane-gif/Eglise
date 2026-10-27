import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.js';
import { bodyOf, paramsOf, queryOf, validate } from '../../middlewares/validate.js';
import { authContext, requireApproved, requireAuth } from '../../middlewares/auth.js';
import { getDatabase } from '../../db/client.js';
import { AppError } from '../../utils/errors.js';
import { albumQuerySchema, getAlbum, listAlbums } from '../gallery/albums-service.js';
import { listAnnouncements, createTestimony, testimonyInputSchema } from '../content/community.js';
import { eventQuerySchema, listEvents, registerForEvent, registrationInputSchema } from '../content/events.js';
import { listDepartments } from '../departments/service.js';
import { notifyDepartmentLeaders, notifyProfiles } from '../../services/notifications.js';
import { recordAudit } from '../../middlewares/audit.js';
import { buildSession } from '../../services/profile-view.js';
import { buildPagination, resolvePagination } from '../../utils/pagination.js';

export const membersRouter = Router();

membersRouter.use(requireAuth);

const uuidParams = z.object({ id: z.string().uuid('Identifiant invalide.') });
const slugParams = z.object({ slug: z.string().trim().min(1).max(160) });

membersRouter.get(
  '/dashboard',
  requireApproved,
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const db = getDatabase();

    const departments = await db.query<{ id: string; name: string; slug: string; member_role: string }>(
      `select d.id, d.name, d.slug, dm.member_role
       from public.department_members dm
       join public.departments d on d.id = dm.department_id
       where dm.profile_id = $1 and dm.status = 'active' and d.archived_at is null
       order by d.name`,
      [profile.id],
    );

    const unread = await db.query<{ total: string }>(
      `select count(*)::text as total from public.notifications
       where profile_id = $1 and read_at is null`,
      [profile.id],
    );

    const events = await listEvents({ page: 1, perPage: 3, upcoming: true, past: undefined });
    const announcements = await listAnnouncements({ audience: 'members', limit: 4 });

    res.json({
      profile: (await buildSession(profile)).profile,
      departments: departments.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        role: row.member_role,
      })),
      unreadNotifications: Number(unread.rows[0]?.total ?? 0),
      upcomingEvents: events.events,
      announcements,
    });
  }),
);

membersRouter.get(
  '/announcements',
  requireApproved,
  asyncHandler(async (_req, res) => {
    res.json({ announcements: await listAnnouncements({ audience: 'members', limit: 30 }) });
  }),
);

membersRouter.get(
  '/albums',
  requireApproved,
  validate({ query: albumQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = queryOf<z.infer<typeof albumQuerySchema>>(req);
    const viewer = authContext(req).profile;
    res.json(await listAlbums(viewer, { ...query, status: undefined }));
  }),
);

membersRouter.get(
  '/albums/:slug',
  requireApproved,
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    const { slug } = paramsOf<{ slug: string }>(req);
    res.json(await getAlbum(authContext(req).profile, slug));
  }),
);

membersRouter.get(
  '/events',
  requireApproved,
  validate({ query: eventQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = queryOf<z.infer<typeof eventQuerySchema>>(req);
    res.json(await listEvents(query));
  }),
);

membersRouter.post(
  '/events/:slug/register',
  requireApproved,
  validate({ params: slugParams, body: registrationInputSchema }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const input = bodyOf<z.infer<typeof registrationInputSchema>>(req);
    const { slug } = paramsOf<{ slug: string }>(req);
    const result = await registerForEvent(slug, input, { id: profile.id });
    res.status(201).json(result);
  }),
);

membersRouter.get(
  '/departments',
  requireApproved,
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const db = getDatabase();
    const departments = await listDepartments({ publicOnly: true });
    const memberships = await db.query<{ department_id: string; member_role: string; status: string }>(
      'select department_id, member_role, status from public.department_members where profile_id = $1',
      [profile.id],
    );
    const pending = await db.query<{ department_id: string }>(
      `select department_id from public.department_requests
       where profile_id = $1 and status = 'pending'`,
      [profile.id],
    );
    const membershipByDept = new Map(memberships.rows.map((row) => [row.department_id, row]));
    const pendingSet = new Set(pending.rows.map((row) => row.department_id));

    res.json({
      departments: departments.map((department) => ({
        ...department,
        membership: membershipByDept.get(department.id) ?? null,
        hasPendingRequest: pendingSet.has(department.id),
      })),
    });
  }),
);

const joinRequestBody = z.object({
  message: z.string().trim().max(1000).optional(),
});

membersRouter.post(
  '/departments/:id/requests',
  requireApproved,
  validate({ params: uuidParams, body: joinRequestBody }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { id } = paramsOf<{ id: string }>(req);
    const { message } = bodyOf<{ message?: string }>(req);
    const db = getDatabase();

    const department = await db.query<{ id: string; name: string }>(
      'select id, name from public.departments where id = $1 and is_active and archived_at is null',
      [id],
    );
    if (!department.rows[0]) throw AppError.notFound('Departement introuvable.');

    const member = await db.query<{ member_role: string }>(
      'select member_role from public.department_members where department_id = $1 and profile_id = $2 and status = $3',
      [id, profile.id, 'active'],
    );
    if (member.rows[0]) throw AppError.conflict('Vous etes deja membre de ce departement.');

    const existing = await db.query<{ id: string }>(
      `select id from public.department_requests
       where department_id = $1 and profile_id = $2 and status = 'pending'`,
      [id, profile.id],
    );
    if (existing.rows[0]) throw AppError.conflict('Une demande est deja en attente.');

    const created = await db.query<{ id: string }>(
      `insert into public.department_requests (department_id, profile_id, message)
       values ($1,$2,$3) returning id`,
      [id, profile.id, message ?? null],
    );

    await notifyDepartmentLeaders(db, id, {
      type: 'department.request',
      title: 'Nouvelle demande de rejoindre un departement',
      body: `${profile.firstName} ${profile.lastName} souhaite rejoindre ${department.rows[0].name}.`,
      link: '/admin/departements',
    });

    res.status(201).json({
      id: created.rows[0].id,
      message: `Votre demande pour le departement « ${department.rows[0].name} » a ete envoyee.`,
    });
  }),
);

membersRouter.get(
  '/departments/requests',
  requireApproved,
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const db = getDatabase();
    const { rows } = await db.query<{
      id: string;
      department_id: string;
      department_name: string;
      status: string;
      decision_note: string | null;
      created_at: string;
      decided_at: string | null;
    }>(
      `select dr.id, dr.department_id, d.name as department_name, dr.status,
              dr.decision_note, dr.created_at, dr.decided_at
       from public.department_requests dr
       join public.departments d on d.id = dr.department_id
       where dr.profile_id = $1
       order by dr.created_at desc`,
      [profile.id],
    );
    res.json({
      requests: rows.map((row) => ({
        id: row.id,
        departmentId: row.department_id,
        departmentName: row.department_name,
        status: row.status,
        decisionNote: row.decision_note,
        createdAt: row.created_at,
        decidedAt: row.decided_at,
      })),
    });
  }),
);

membersRouter.delete(
  '/departments/requests/:id',
  requireApproved,
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { id } = paramsOf<{ id: string }>(req);
    const db = getDatabase();
    const { rows } = await db.query<{ id: string }>(
      `delete from public.department_requests
       where id = $1 and profile_id = $2 and status = 'pending' returning id`,
      [id, profile.id],
    );
    if (!rows[0]) throw AppError.notFound('Demande introuvable ou deja traitee.');
    res.json({ ok: true });
  }),
);

membersRouter.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const db = getDatabase();
    const { rows } = await db.query<{
      id: string;
      type: string;
      title: string;
      body: string | null;
      link: string | null;
      read_at: string | null;
      created_at: string;
    }>(
      `select id, type, title, body, link, read_at, created_at
       from public.notifications where profile_id = $1
       order by created_at desc limit 50`,
      [profile.id],
    );
    res.json({
      notifications: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        link: row.link,
        readAt: row.read_at,
        createdAt: row.created_at,
      })),
    });
  }),
);

membersRouter.get(
  '/notifications/unread-count',
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const db = getDatabase();
    const { rows } = await db.query<{ total: string }>(
      `select count(*)::text as total from public.notifications
       where profile_id = $1 and read_at is null`,
      [profile.id],
    );
    res.json({ unread: Number(rows[0]?.total ?? 0) });
  }),
);

membersRouter.post(
  '/notifications/:id/read',
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { id } = paramsOf<{ id: string }>(req);
    const db = getDatabase();
    const { rowCount } = await db.query(
      `update public.notifications set read_at = now()
       where id = $1 and profile_id = $2 and read_at is null`,
      [id, profile.id],
    );
    res.json({ ok: true, updated: rowCount });
  }),
);

membersRouter.post(
  '/notifications/read-all',
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const db = getDatabase();
    const { rowCount } = await db.query(
      `update public.notifications set read_at = now()
       where profile_id = $1 and read_at is null`,
      [profile.id],
    );
    res.json({ ok: true, updated: rowCount });
  }),
);

membersRouter.get(
  '/directory',
  requireApproved,
  asyncHandler(async (_req, res) => {
    const db = getDatabase();
    const { rows } = await db.query<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      city: string | null;
      profession: string | null;
    }>(
      `select id, first_name, last_name, city, profession
       from public.profiles where status = 'approved'
       order by last_name asc, first_name asc limit 500`,
    );
    // Annuaire volontairement minimal : ni e-mail, ni telephone.
    res.json({
      members: rows.map((row) => ({
        id: row.id,
        fullName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
        city: row.city,
        profession: row.profession,
      })),
      note: 'Annuaire interne : les coordonnees personnelles ne sont pas exposees.',
    });
  }),
);

membersRouter.post(
  '/testimonies',
  requireApproved,
  validate({ body: testimonyInputSchema }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const input = bodyOf<z.infer<typeof testimonyInputSchema>>(req);
    const testimony = await createTestimony(input, profile);
    res.status(201).json({
      testimony,
      message: 'Merci ! Votre temoignage sera publie apres moderation.',
    });
  }),
);

membersRouter.get(
  '/testimonies/mine',
  requireApproved,
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const db = getDatabase();
    const { rows } = await db.query<{
      id: string;
      title: string;
      body: string;
      status: string;
      is_public: boolean;
      created_at: string;
    }>(
      `select id, title, body, status, is_public, created_at
       from public.testimonies where profile_id = $1 order by created_at desc limit 50`,
      [profile.id],
    );
    res.json({
      testimonies: rows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        status: row.status,
        isPublic: row.is_public,
        createdAt: row.created_at,
      })),
    });
  }),
);

membersRouter.get(
  '/prayer-requests/mine',
  requireApproved,
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const db = getDatabase();
    const { rows } = await db.query<{
      id: string;
      message: string;
      status: string;
      created_at: string;
    }>(
      `select id, message, status, created_at from public.prayer_requests
       where profile_id = $1 order by created_at desc limit 50`,
      [profile.id],
    );
    res.json({
      requests: rows.map((row) => ({
        id: row.id,
        message: row.message,
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  }),
);

membersRouter.get(
  '/audit/mine',
  requireApproved,
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const db = getDatabase();
    const { limit, offset } = resolvePagination(1, 20);
    const { rows } = await db.query<{ action: string; created_at: string }>(
      `select action, created_at from public.audit_logs
       where actor_id = $1 order by created_at desc limit $2 offset $3`,
      [profile.id, limit, offset],
    );
    res.json({
      entries: rows.map((row) => ({ action: row.action, createdAt: row.created_at })),
      pagination: buildPagination(1, 20, rows.length),
    });
  }),
);

/** Notifie un membre qu'un administrateur a change son statut (usage interne). */
export async function notifyMemberStatus(profileId: string, title: string, body: string) {
  const db = getDatabase();
  await notifyProfiles(db, [profileId], {
    type: 'membership.status',
    title,
    body,
    link: '/espace-membre',
  });
  await recordAudit(db, {
    action: 'notification.membership_status',
    entityType: 'profile',
    entityId: profileId,
  });
}
