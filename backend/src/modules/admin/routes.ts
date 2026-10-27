import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.js';
import { bodyOf, paramsOf, queryOf, validate } from '../../middlewares/validate.js';
import { authContext, requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { upload, validateUpload } from '../../middlewares/upload.js';
import { uploadLimiter } from '../../middlewares/rateLimit.js';
import { AppError } from '../../utils/errors.js';
import { getDatabase } from '../../db/client.js';
import { isAdmin, isApproved, canManageDepartment, type AuthProfile } from '../../auth/permissions.js';
import { recordAudit } from '../../middlewares/audit.js';
import { storeUpload, removeStoredFile } from '../../services/files.js';
import { notifyProfiles } from '../../services/notifications.js';
import { paginationSchema } from '../../utils/pagination.js';
import {
  changeMemberRole,
  changeMemberStatus,
  getMemberDetail,
  listMemberHistory,
  listMembers,
  memberQuerySchema,
  roleChangeSchema,
  statusChangeSchema,
} from './members.js';
import {
  archiveDepartment,
  createDepartment,
  departmentInputSchema,
  listDepartmentMembers,
  listDepartments,
  updateDepartment,
} from '../departments/service.js';
import {
  createSermon,
  deleteSermon,
  listSermons,
  sermonInputSchema,
  sermonQuerySchema,
  setSermonMedia,
  updateSermon,
} from '../content/sermons.js';
import {
  createEvent,
  deleteEvent,
  eventInputSchema,
  eventQuerySchema,
  listEventRegistrations,
  listEvents,
  setEventCover,
  updateEvent,
  cancelRegistration,
} from '../content/events.js';
import {
  announcementInputSchema,
  createAnnouncement,
  deleteAnnouncement,
  listAllAnnouncements,
  listPrayerRequests,
  listTestimoniesForAdmin,
  moderateTestimony,
  updateAnnouncement,
  updatePrayerStatus,
} from '../content/community.js';
import {
  currentBrandingPaths,
  getSettings,
  setBrandingImage,
  settingsUpdateSchema,
  updateSettings,
} from '../settings/service.js';
import { auditQuerySchema, dashboardStats, listAuditLogs } from './insights.js';
import {
  contributionInputSchema,
  createContribution,
  createExpense,
  deleteContribution,
  deleteExpense,
  expenseInputSchema,
  financeSummary,
  listContributions,
  listExpenses,
} from './finance.js';

export const adminRouter = Router();

adminRouter.use(requireAuth);

/** Administrateurs et responsables de departement (perimetre verifie ensuite). */
const requireStaff: RequestHandler = (req, _res, next) => {
  const profile = req.auth?.profile;
  if (!req.auth || !profile) return next(AppError.unauthorized());
  if (isAdmin(profile)) return next();
  if (isApproved(profile) && profile.role === 'department_leader') return next();
  return next(AppError.forbidden('Acces reserve a l administration.'));
};

const uuidParams = z.object({ id: z.string().uuid('Identifiant invalide.') });

adminRouter.get(
  '/dashboard',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await dashboardStats());
  }),
);

/* -------------------------------------------------------------------------- */
/* Membres et approbations                                                    */
/* -------------------------------------------------------------------------- */

adminRouter.get(
  '/members',
  requireAdmin,
  validate({ query: memberQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listMembers(queryOf<z.infer<typeof memberQuerySchema>>(req)));
  }),
);

adminRouter.get(
  '/members/:id',
  requireAdmin,
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    res.json(await getMemberDetail(id));
  }),
);

adminRouter.patch(
  '/members/:id/status',
  requireAdmin,
  validate({ params: uuidParams, body: statusChangeSchema }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const input = bodyOf<z.infer<typeof statusChangeSchema>>(req);
    const member = await changeMemberStatus(id, input, authContext(req).profile);
    res.json(member);
  }),
);

adminRouter.patch(
  '/members/:id/role',
  requireAdmin,
  validate({ params: uuidParams, body: roleChangeSchema }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const input = bodyOf<z.infer<typeof roleChangeSchema>>(req);
    res.json(await changeMemberRole(id, input, authContext(req).profile));
  }),
);

adminRouter.get(
  '/members/:id/history',
  requireAdmin,
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    res.json({ history: await listMemberHistory(id) });
  }),
);

/* -------------------------------------------------------------------------- */
/* Departements                                                               */
/* -------------------------------------------------------------------------- */

adminRouter.get(
  '/departments',
  requireStaff,
  asyncHandler(async (req, res) => {
    const profile = authContext(req).profile;
    const departments = await listDepartments({
      includeInactive: true,
      includeArchived: true,
    });
    if (isAdmin(profile)) {
      res.json({ departments });
      return;
    }
    const manageable = await Promise.all(
      departments.map(async (department) => ({
        ...department,
        canManage: await canManageDepartment(getDatabase(), profile, department.id),
      })),
    );
    res.json({ departments: manageable });
  }),
);

adminRouter.post(
  '/departments',
  requireAdmin,
  validate({ body: departmentInputSchema }),
  asyncHandler(async (req, res) => {
    const input = bodyOf<z.infer<typeof departmentInputSchema>>(req);
    res.status(201).json(await createDepartment(input, authContext(req).profile));
  }),
);

async function assertDepartmentScope(profile: AuthProfile, departmentId: string): Promise<void> {
  if (isAdmin(profile)) return;
  const allowed = await canManageDepartment(getDatabase(), profile, departmentId);
  if (!allowed) {
    throw AppError.forbidden("Vous ne gerez pas ce departement.");
  }
}

adminRouter.patch(
  '/departments/:id',
  requireStaff,
  validate({ params: uuidParams, body: departmentInputSchema.partial() }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { id } = paramsOf<{ id: string }>(req);
    await assertDepartmentScope(profile, id);
    if (!isAdmin(profile)) {
      const body = bodyOf<Record<string, unknown>>(req);
      const forbidden = ['leaderId', 'isActive', 'sortOrder'].filter((key) => key in body);
      if (forbidden.length > 0) {
        throw AppError.forbidden(
          'Seul un administrateur peut modifier le responsable, le statut ou l ordre.',
        );
      }
    }
    const input = bodyOf<z.infer<typeof departmentInputSchema>>(req);
    res.json(await updateDepartment(id, input, profile));
  }),
);

adminRouter.post(
  '/departments/:id/archive',
  requireAdmin,
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    await archiveDepartment(id, authContext(req).profile);
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/departments/:id/image',
  requireStaff,
  uploadLimiter,
  upload.single('image'),
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { id } = paramsOf<{ id: string }>(req);
    await assertDepartmentScope(profile, id);
    const file = validateUpload(req.file, 'image');
    const stored = await storeUpload('public/departments', file, { publicFile: true });
    const department = await updateDepartment(id, { imagePath: stored.path }, profile);
    res.json(department);
  }),
);

adminRouter.get(
  '/departments/:id/members',
  requireStaff,
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { id } = paramsOf<{ id: string }>(req);
    await assertDepartmentScope(profile, id);
    res.json({ members: await listDepartmentMembers(id) });
  }),
);

adminRouter.post(
  '/departments/:id/members',
  requireStaff,
  validate({
    params: uuidParams,
    body: z.object({
      profileId: z.string().uuid(),
      role: z.enum(['leader', 'assistant', 'member']).default('member'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { id } = paramsOf<{ id: string }>(req);
    await assertDepartmentScope(profile, id);
    const input = bodyOf<{ profileId: string; role: 'leader' | 'assistant' | 'member' }>(req);
    const db = getDatabase();

    const member = await db.query<{ status: string }>(
      'select status from public.profiles where id = $1',
      [input.profileId],
    );
    if (!member.rows[0]) throw AppError.notFound('Membre introuvable.');
    if (member.rows[0].status !== 'approved') {
      throw AppError.badRequest("Seul un membre approuve peut rejoindre un departement.");
    }

    await db.query(
      `insert into public.department_members (department_id, profile_id, member_role, status)
       values ($1,$2,$3,'active')
       on conflict (department_id, profile_id)
       do update set member_role = excluded.member_role, status = 'active'`,
      [id, input.profileId, input.role],
    );

    await notifyProfiles(db, [input.profileId], {
      type: 'department.added',
      title: 'Nouveau departement',
      body: 'Vous avez ete ajoute a un departement.',
      link: '/espace-membre/departements',
    });
    await recordAudit(db, {
      actorId: profile.id,
      actorEmail: profile.email,
      action: 'department.member.add',
      entityType: 'department',
      entityId: id,
      metadata: { profileId: input.profileId, role: input.role },
    });
    res.status(201).json({ ok: true });
  }),
);

adminRouter.delete(
  '/departments/:id/members/:profileId',
  requireStaff,
  validate({ params: z.object({ id: z.string().uuid(), profileId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { id, profileId } = paramsOf<{ id: string; profileId: string }>(req);
    await assertDepartmentScope(profile, id);
    const db = getDatabase();
    await db.query(
      `update public.department_members set status = 'left'
       where department_id = $1 and profile_id = $2`,
      [id, profileId],
    );
    await recordAudit(db, {
      actorId: profile.id,
      actorEmail: profile.email,
      action: 'department.member.remove',
      entityType: 'department',
      entityId: id,
      metadata: { profileId },
    });
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/departments/requests',
  requireStaff,
  validate({ query: z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }) }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { status } = queryOf<{ status?: string }>(req);
    const db = getDatabase();
    const params: unknown[] = [];
    let filter = '';
    if (status) {
      params.push(status);
      filter = `and dr.status = $${params.length}`;
    }
    const { rows } = await db.query<{
      id: string;
      department_id: string;
      department_name: string;
      profile_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      message: string | null;
      status: string;
      created_at: string;
    }>(
      `select dr.id, dr.department_id, d.name as department_name, dr.profile_id,
              p.first_name, p.last_name, p.email, dr.message, dr.status, dr.created_at
       from public.department_requests dr
       join public.departments d on d.id = dr.department_id
       join public.profiles p on p.id = dr.profile_id
       where dr.status in ('pending','approved','rejected') ${filter}
       order by (dr.status = 'pending') desc, dr.created_at desc
       limit 100`,
      params,
    );

    const visible = [];
    for (const row of rows) {
      if (!isAdmin(profile) && !(await canManageDepartment(db, profile, row.department_id))) {
        continue;
      }
      visible.push({
        id: row.id,
        departmentId: row.department_id,
        departmentName: row.department_name,
        profileId: row.profile_id,
        memberName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
        email: row.email,
        message: row.message,
        status: row.status,
        createdAt: row.created_at,
      });
    }
    res.json({ requests: visible });
  }),
);

adminRouter.patch(
  '/departments/requests/:id',
  requireStaff,
  validate({
    params: uuidParams,
    body: z.object({
      status: z.enum(['approved', 'rejected']),
      note: z.string().trim().max(1000).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { id } = paramsOf<{ id: string }>(req);
    const input = bodyOf<{ status: 'approved' | 'rejected'; note?: string }>(req);
    const db = getDatabase();

    const request = await db.query<{
      id: string;
      department_id: string;
      profile_id: string;
      status: string;
      department_name: string;
    }>(
      `select dr.id, dr.department_id, dr.profile_id, dr.status, d.name as department_name
       from public.department_requests dr
       join public.departments d on d.id = dr.department_id
       where dr.id = $1`,
      [id],
    );
    const row = request.rows[0];
    if (!row) throw AppError.notFound('Demande introuvable.');
    await assertDepartmentScope(profile, row.department_id);
    if (row.status !== 'pending') throw AppError.conflict('Cette demande a deja ete traitee.');

    await db.transaction(async (tx) => {
      await tx.query(
        `update public.department_requests
         set status = $2, decided_by = $3, decided_at = now(), decision_note = $4
         where id = $1`,
        [id, input.status, profile.id, input.note ?? null],
      );
      if (input.status === 'approved') {
        await tx.query(
          `insert into public.department_members (department_id, profile_id, member_role, status)
           values ($1,$2,'member','active')
           on conflict (department_id, profile_id)
           do update set status = 'active'`,
          [row.department_id, row.profile_id],
        );
      }
    });

    await notifyProfiles(db, [row.profile_id], {
      type: 'department.request_decision',
      title:
        input.status === 'approved'
          ? 'Demande de departement acceptee'
          : 'Demande de departement refusee',
      body: `Departement « ${row.department_name} »${input.note ? ` — ${input.note}` : ''}.`,
      link: '/espace-membre/departements',
    });
    await recordAudit(db, {
      actorId: profile.id,
      actorEmail: profile.email,
      action: `department.request.${input.status}`,
      entityType: 'department_request',
      entityId: id,
      metadata: { departmentId: row.department_id, profileId: row.profile_id },
    });

    res.json({ ok: true, status: input.status });
  }),
);

/* -------------------------------------------------------------------------- */
/* Predications                                                               */
/* -------------------------------------------------------------------------- */

adminRouter.get(
  '/sermons',
  requireAdmin,
  validate({ query: sermonQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listSermons(queryOf<z.infer<typeof sermonQuerySchema>>(req), true));
  }),
);

adminRouter.post(
  '/sermons',
  requireAdmin,
  validate({ body: sermonInputSchema }),
  asyncHandler(async (req, res) => {
    const input = bodyOf<z.infer<typeof sermonInputSchema>>(req);
    res.status(201).json(await createSermon(input, authContext(req).profile));
  }),
);

adminRouter.patch(
  '/sermons/:id',
  requireAdmin,
  validate({ params: uuidParams, body: sermonInputSchema.partial() }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const input = bodyOf<Partial<z.infer<typeof sermonInputSchema>>>(req);
    res.json(await updateSermon(id, input, authContext(req).profile));
  }),
);

adminRouter.delete(
  '/sermons/:id',
  requireAdmin,
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    await deleteSermon(id, authContext(req).profile);
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/sermons/:id/media',
  requireAdmin,
  uploadLimiter,
  upload.single('file'),
  validate({ params: uuidParams, query: z.object({ kind: z.enum(['audio', 'document']) }) }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const { kind } = queryOf<{ kind: 'audio' | 'document' }>(req);
    const file = validateUpload(req.file, kind);
    const stored = await storeUpload(`sermons/${id}`, file);
    res.json(await setSermonMedia(id, kind, stored.path, authContext(req).profile));
  }),
);

/* -------------------------------------------------------------------------- */
/* Evenements                                                                 */
/* -------------------------------------------------------------------------- */

adminRouter.get(
  '/events',
  requireAdmin,
  validate({ query: eventQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listEvents(queryOf<z.infer<typeof eventQuerySchema>>(req), { includeDrafts: true }));
  }),
);

adminRouter.post(
  '/events',
  requireAdmin,
  validate({ body: eventInputSchema }),
  asyncHandler(async (req, res) => {
    const input = bodyOf<z.infer<typeof eventInputSchema>>(req);
    res.status(201).json(await createEvent(input, authContext(req).profile));
  }),
);

adminRouter.patch(
  '/events/:id',
  requireAdmin,
  validate({ params: uuidParams, body: eventInputSchema.partial() }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const input = bodyOf<Partial<z.infer<typeof eventInputSchema>>>(req);
    res.json(await updateEvent(id, input, authContext(req).profile));
  }),
);

adminRouter.delete(
  '/events/:id',
  requireAdmin,
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    await deleteEvent(id, authContext(req).profile);
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/events/:id/cover',
  requireAdmin,
  uploadLimiter,
  upload.single('image'),
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const file = validateUpload(req.file, 'image');
    const stored = await storeUpload(`events/${id}`, file);
    res.json(await setEventCover(id, stored.path, authContext(req).profile));
  }),
);

adminRouter.get(
  '/events/:id/registrations',
  requireAdmin,
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    res.json({ registrations: await listEventRegistrations(id) });
  }),
);

adminRouter.get(
  '/events/:id/registrations/export',
  requireAdmin,
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const registrations = await listEventRegistrations(id);
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['Nom', 'Email', 'Telephone', 'Places', 'Statut', 'Date'].map(escape).join(';'),
      ...registrations.map((row) =>
        [row.fullName, row.email, row.phone, row.seats, row.status, row.createdAt]
          .map(escape)
          .join(';'),
      ),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="inscriptions-${id}.csv"`);
    res.send(`\uFEFF${lines.join('\r\n')}`);
  }),
);

adminRouter.delete(
  '/events/:id/registrations/:registrationId',
  requireAdmin,
  validate({ params: z.object({ id: z.string().uuid(), registrationId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const { id, registrationId } = paramsOf<{ id: string; registrationId: string }>(req);
    await cancelRegistration(id, registrationId);
    res.json({ ok: true });
  }),
);

/* -------------------------------------------------------------------------- */
/* Annonces / priere / temoignages / retraits                                 */
/* -------------------------------------------------------------------------- */

adminRouter.get(
  '/announcements',
  requireAdmin,
  validate({ query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const { page, perPage } = queryOf<{ page: number; perPage: number }>(req);
    res.json(await listAllAnnouncements(page, perPage));
  }),
);

adminRouter.post(
  '/announcements',
  requireAdmin,
  validate({ body: announcementInputSchema }),
  asyncHandler(async (req, res) => {
    const input = bodyOf<z.infer<typeof announcementInputSchema>>(req);
    res.status(201).json(await createAnnouncement(input, authContext(req).profile));
  }),
);

adminRouter.patch(
  '/announcements/:id',
  requireAdmin,
  validate({ params: uuidParams, body: announcementInputSchema.partial() }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const input = bodyOf<Partial<z.infer<typeof announcementInputSchema>>>(req);
    res.json(await updateAnnouncement(id, input, authContext(req).profile));
  }),
);

adminRouter.delete(
  '/announcements/:id',
  requireAdmin,
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    await deleteAnnouncement(id, authContext(req).profile);
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/prayer-requests',
  requireAdmin,
  validate({
    query: z.object({
      status: z.enum(['new', 'in_prayer', 'closed']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      perPage: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  asyncHandler(async (req, res) => {
    res.json(await listPrayerRequests(queryOf<{ status?: string; page: number; perPage: number }>(req)));
  }),
);

adminRouter.patch(
  '/prayer-requests/:id',
  requireAdmin,
  validate({ params: uuidParams, body: z.object({ status: z.enum(['new', 'in_prayer', 'closed']) }) }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const { status } = bodyOf<{ status: 'new' | 'in_prayer' | 'closed' }>(req);
    res.json(await updatePrayerStatus(id, status, authContext(req).profile));
  }),
);

adminRouter.get(
  '/testimonies',
  requireAdmin,
  validate({ query: z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }) }),
  asyncHandler(async (req, res) => {
    const { status } = queryOf<{ status?: string }>(req);
    res.json({ testimonies: await listTestimoniesForAdmin(status) });
  }),
);

adminRouter.patch(
  '/testimonies/:id',
  requireAdmin,
  validate({ params: uuidParams, body: z.object({ status: z.enum(['approved', 'rejected']) }) }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    const { status } = bodyOf<{ status: 'approved' | 'rejected' }>(req);
    res.json(await moderateTestimony(id, status, authContext(req).profile));
  }),
);

adminRouter.get(
  '/takedown-requests',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const db = getDatabase();
    const { rows } = await db.query<{
      id: string;
      photo_id: string | null;
      album_id: string | null;
      requester_name: string;
      requester_email: string;
      reason: string;
      status: string;
      created_at: string;
    }>(
      `select id, photo_id, album_id, requester_name, requester_email, reason, status, created_at
       from public.photo_takedown_requests
       order by (status = 'pending') desc, created_at desc limit 100`,
    );
    res.json({
      requests: rows.map((row) => ({
        id: row.id,
        photoId: row.photo_id,
        albumId: row.album_id,
        requesterName: row.requester_name,
        requesterEmail: row.requester_email,
        reason: row.reason,
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  }),
);

adminRouter.patch(
  '/takedown-requests/:id',
  requireAdmin,
  validate({
    params: uuidParams,
    body: z.object({ status: z.enum(['approved', 'rejected']), note: z.string().trim().max(600).optional() }),
  }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { id } = paramsOf<{ id: string }>(req);
    const input = bodyOf<{ status: 'approved' | 'rejected'; note?: string }>(req);
    const db = getDatabase();
    const { rows } = await db.query<{
      id: string;
      photo_id: string | null;
      album_id: string | null;
      status: string;
    }>('select id, photo_id, album_id, status from public.photo_takedown_requests where id = $1', [id]);
    const request = rows[0];
    if (!request) throw AppError.notFound('Demande introuvable.');
    if (request.status !== 'pending') throw AppError.conflict('Demande deja traitee.');

    if (input.status === 'approved' && request.photo_id) {
      const photo = await db.query<{ storage_path: string }>(
        'select storage_path from public.photos where id = $1',
        [request.photo_id],
      );
      await db.query('delete from public.photos where id = $1', [request.photo_id]);
      await removeStoredFile(photo.rows[0]?.storage_path);
    }

    await db.query(
      `update public.photo_takedown_requests
       set status = $2, handled_by = $3, handled_at = now() where id = $1`,
      [id, input.status, profile.id],
    );
    await recordAudit(db, {
      actorId: profile.id,
      actorEmail: profile.email,
      action: `gallery.takedown_${input.status}`,
      entityType: 'photo_takedown_request',
      entityId: id,
      metadata: { note: input.note ?? null },
    });

    res.json({ ok: true });
  }),
);

/* -------------------------------------------------------------------------- */
/* Parametres de l'eglise                                                     */
/* -------------------------------------------------------------------------- */

adminRouter.get(
  '/settings',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await getSettings());
  }),
);

adminRouter.patch(
  '/settings',
  requireAdmin,
  validate({ body: settingsUpdateSchema }),
  asyncHandler(async (req, res) => {
    const input = bodyOf<z.infer<typeof settingsUpdateSchema>>(req);
    res.json(await updateSettings(input, authContext(req).profile));
  }),
);

adminRouter.post(
  '/settings/:kind',
  requireAdmin,
  uploadLimiter,
  upload.single('image'),
  validate({ params: z.object({ kind: z.enum(['logo', 'hero']) }) }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const { kind } = paramsOf<{ kind: 'logo' | 'hero' }>(req);
    const file = validateUpload(req.file, 'image');
    const previous = await currentBrandingPaths();
    const stored = await storeUpload(`public/branding/${kind}`, file, { publicFile: true });
    const settings = await setBrandingImage(kind, stored.path, profile);
    await removeStoredFile(kind === 'logo' ? previous.logo : previous.hero);
    res.json(settings);
  }),
);

/* -------------------------------------------------------------------------- */
/* Journal d'audit                                                            */
/* -------------------------------------------------------------------------- */

adminRouter.get(
  '/audit-logs',
  requireAdmin,
  validate({ query: auditQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listAuditLogs(queryOf<z.infer<typeof auditQuerySchema>>(req)));
  }),
);

/* -------------------------------------------------------------------------- */
/* Finances internes                                                          */
/* -------------------------------------------------------------------------- */

adminRouter.get(
  '/finance/summary',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await financeSummary());
  }),
);

adminRouter.get(
  '/finance/contributions',
  requireAdmin,
  validate({ query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const { page, perPage } = queryOf<{ page: number; perPage: number }>(req);
    res.json(await listContributions(page, perPage));
  }),
);

adminRouter.post(
  '/finance/contributions',
  requireAdmin,
  validate({ body: contributionInputSchema }),
  asyncHandler(async (req, res) => {
    const input = bodyOf<z.infer<typeof contributionInputSchema>>(req);
    res.status(201).json(await createContribution(input, authContext(req).profile));
  }),
);

adminRouter.delete(
  '/finance/contributions/:id',
  requireAdmin,
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    await deleteContribution(id, authContext(req).profile);
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/finance/expenses',
  requireAdmin,
  validate({ query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const { page, perPage } = queryOf<{ page: number; perPage: number }>(req);
    res.json(await listExpenses(page, perPage));
  }),
);

adminRouter.post(
  '/finance/expenses',
  requireAdmin,
  validate({ body: expenseInputSchema }),
  asyncHandler(async (req, res) => {
    const input = bodyOf<z.infer<typeof expenseInputSchema>>(req);
    res.status(201).json(await createExpense(input, authContext(req).profile));
  }),
);

adminRouter.delete(
  '/finance/expenses/:id',
  requireAdmin,
  validate({ params: uuidParams }),
  asyncHandler(async (req, res) => {
    const { id } = paramsOf<{ id: string }>(req);
    await deleteExpense(id, authContext(req).profile);
    res.json({ ok: true });
  }),
);

