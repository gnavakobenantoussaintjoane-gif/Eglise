import { z } from 'zod';
import { getDatabase } from '../../db/client.js';
import { AppError } from '../../utils/errors.js';
import { buildPagination, resolvePagination, likeTerm } from '../../utils/pagination.js';
import { recordAudit } from '../../middlewares/audit.js';
import { notifyProfiles } from '../../services/notifications.js';
import { signedFileUrl } from '../../services/files.js';
import type { AuthProfile } from '../../auth/permissions.js';
import { MEMBER_STATUSES, type MemberStatus } from '../../config/constants.js';
import { mapProfileRow, toFullProfile, type ProfileRow } from '../profiles/mapper.js';

export const memberQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(MEMBER_STATUSES).optional(),
  role: z.enum(['member', 'department_leader', 'media', 'admin']).optional(),
  search: z.string().trim().max(120).optional(),
});

/** Transitions autorisees : garde-fou metier, verifie cote serveur. */
const TRANSITIONS: Record<MemberStatus, MemberStatus[]> = {
  profile_incomplete: [],
  pending_review: ['approved', 'rejected', 'suspended'],
  rejected: ['approved', 'pending_review'],
  approved: ['suspended'],
  suspended: ['approved', 'rejected'],
};

export const statusChangeSchema = z.object({
  status: z.enum(['approved', 'rejected', 'suspended']),
  note: z.string().trim().max(1500).optional(),
});

export const roleChangeSchema = z.object({
  role: z.enum(['member', 'department_leader', 'media', 'admin']),
  note: z.string().trim().max(1000).optional(),
});

export interface MemberListItem {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  city: string | null;
  profession: string | null;
  status: MemberStatus;
  role: string;
  photoUrl: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export async function listMembers(query: z.infer<typeof memberQuerySchema>) {
  const db = getDatabase();
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.status) {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }
  if (query.role) {
    params.push(query.role);
    where.push(`role = $${params.length}`);
  }
  if (query.search) {
    params.push(likeTerm(query.search));
    where.push(
      `(coalesce(first_name,'') ilike $${params.length} escape '\\'
        or coalesce(last_name,'') ilike $${params.length} escape '\\'
        or email ilike $${params.length} escape '\\'
        or coalesce(city,'') ilike $${params.length} escape '\\')`,
    );
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const { limit, offset } = resolvePagination(query.page, query.perPage);

  const total = await db.query<{ total: string }>(
    `select count(*)::text as total from public.profiles ${whereSql}`,
    params,
  );
  params.push(limit, offset);
  const { rows } = await db.query<ProfileRow>(
    `select * from public.profiles ${whereSql}
     order by
       case status when 'pending_review' then 0 when 'profile_incomplete' then 1 else 2 end,
       submitted_at desc nulls last, created_at desc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );

  const members: MemberListItem[] = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      firstName: row.first_name ?? '',
      lastName: row.last_name ?? '',
      fullName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
      email: row.email,
      phone: row.phone,
      city: row.city,
      profession: row.profession,
      status: row.status,
      role: row.role,
      photoUrl: await signedFileUrl(row.photo_path, 1800),
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    })),
  );

  return {
    members,
    pagination: buildPagination(query.page, query.perPage, Number(total.rows[0]?.total ?? 0)),
  };
}

export async function getMemberDetail(id: string) {
  const db = getDatabase();
  const { rows } = await db.query<ProfileRow>('select * from public.profiles where id = $1', [id]);
  const row = rows[0];
  if (!row) throw AppError.notFound('Membre introuvable.');

  const profile = mapProfileRow(row);
  const history = await db.query<{
    status: MemberStatus;
    note: string | null;
    created_at: string;
    actor_first: string | null;
    actor_last: string | null;
  }>(
    `select h.status, h.note, h.created_at, a.first_name as actor_first, a.last_name as actor_last
     from public.membership_history h
     left join public.profiles a on a.id = h.actor_id
     where h.profile_id = $1 order by h.created_at desc`,
    [id],
  );
  const departments = await db.query<{
    id: string;
    name: string;
    member_role: string;
    status: string;
    joined_at: string;
  }>(
    `select d.id, d.name, dm.member_role, dm.status, dm.joined_at
     from public.department_members dm
     join public.departments d on d.id = dm.department_id
     where dm.profile_id = $1 order by d.name`,
    [id],
  );

  return {
    ...toFullProfile(profile, await signedFileUrl(profile.photoPath, 1800)),
    departmentInterestId: profile.departmentInterestId,
    history: history.rows.map((entry) => ({
      status: entry.status,
      note: entry.note,
      createdAt: entry.created_at,
      actorName: `${entry.actor_first ?? ''} ${entry.actor_last ?? ''}`.trim() || null,
    })),
    departments: departments.rows.map((entry) => ({
      id: entry.id,
      name: entry.name,
      role: entry.member_role,
      status: entry.status,
      joinedAt: entry.joined_at,
    })),
  };
}

async function countActiveAdmins(): Promise<number> {
  const db = getDatabase();
  const { rows } = await db.query<{ total: string }>(
    `select count(*)::text as total from public.profiles
     where role = 'admin' and status = 'approved'`,
  );
  return Number(rows[0]?.total ?? 0);
}

export async function changeMemberStatus(
  targetId: string,
  input: z.infer<typeof statusChangeSchema>,
  actor: AuthProfile,
) {
  if (targetId === actor.id) {
    throw AppError.forbidden('Vous ne pouvez pas modifier votre propre statut.');
  }

  const db = getDatabase();
  const { rows } = await db.query<ProfileRow>('select * from public.profiles where id = $1', [
    targetId,
  ]);
  const target = rows[0];
  if (!target) throw AppError.notFound('Membre introuvable.');

  const allowed = TRANSITIONS[target.status];
  if (!allowed.includes(input.status)) {
    throw AppError.badRequest(
      `Transition impossible : « ${target.status} » vers « ${input.status} ».`,
      { allowedFrom: target.status, allowedTo: allowed },
    );
  }

  if (input.status === 'rejected' && !input.note?.trim()) {
    throw AppError.badRequest('Un motif est requis pour refuser une demande.');
  }
  if (target.role === 'admin' && target.status === 'approved' && input.status === 'suspended') {
    if ((await countActiveAdmins()) <= 1) {
      throw AppError.conflict('Impossible de suspendre le dernier administrateur actif.');
    }
  }

  const updated = await db.transaction(async (tx) => {
    const result = await tx.query<ProfileRow>(
      `update public.profiles
       set status = $2,
           reviewed_at = now(),
           reviewed_by = $3,
           decision_note = $4,
           submitted_at = coalesce(submitted_at, now())
       where id = $1
       returning *`,
      [targetId, input.status, actor.id, input.note ?? null],
    );
    await tx.query(
      `insert into public.membership_history (profile_id, status, note, actor_id)
       values ($1, $2, $3, $4)`,
      [targetId, input.status, input.note ?? null, actor.id],
    );
    return result.rows[0];
  });

  const messages: Record<string, string> = {
    approved: "Votre inscription a ete approuvee. Bienvenue dans l'espace membre !",
    rejected: 'Votre demande d adhesion a ete refusee.',
    suspended: 'Votre compte a ete suspendu. Contactez un administrateur.',
  };
  await notifyProfiles(db, [targetId], {
    type: 'membership.status',
    title:
      input.status === 'approved'
        ? 'Inscription approuvee'
        : input.status === 'rejected'
          ? "Demande d'adhesion refusee"
          : 'Compte suspendu',
    body: `${messages[input.status]}${input.note ? ` Motif : ${input.note}` : ''}`,
    link: '/espace-membre',
  });

  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: `member.status.${input.status}`,
    entityType: 'profile',
    entityId: targetId,
    metadata: { from: target.status, to: input.status, note: input.note ?? null },
  });

  return getMemberDetail(updated.id);
}

export async function changeMemberRole(
  targetId: string,
  input: z.infer<typeof roleChangeSchema>,
  actor: AuthProfile,
) {
  if (targetId === actor.id) {
    throw AppError.forbidden('Vous ne pouvez pas modifier votre propre role.');
  }
  const db = getDatabase();
  const { rows } = await db.query<ProfileRow>('select * from public.profiles where id = $1', [
    targetId,
  ]);
  const target = rows[0];
  if (!target) throw AppError.notFound('Membre introuvable.');

  if (target.status !== 'approved') {
    throw AppError.badRequest(
      "Le role ne peut etre attribue qu'a un membre dont l'inscription est approuvee.",
    );
  }
  if (target.role === 'admin' && input.role !== 'admin') {
    if ((await countActiveAdmins()) <= 1) {
      throw AppError.conflict('Impossible de retirer le role du dernier administrateur actif.');
    }
  }

  const { rows: updated } = await db.query<ProfileRow>(
    `update public.profiles set role = $2 where id = $1 returning *`,
    [targetId, input.role],
  );

  await notifyProfiles(db, [targetId], {
    type: 'member.role',
    title: 'Votre role a ete mis a jour',
    body: `Nouveau role : ${input.role}.`,
    link: '/espace-membre',
  });

  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'member.role.update',
    entityType: 'profile',
    entityId: targetId,
    metadata: { from: target.role, to: input.role, note: input.note ?? null },
  });

  return getMemberDetail(updated[0].id);
}

export async function listMemberHistory(profileId: string) {
  const db = getDatabase();
  const { rows } = await db.query<{ status: string; note: string | null; created_at: string }>(
    `select status, note, created_at from public.membership_history
     where profile_id = $1 order by created_at desc`,
    [profileId],
  );
  return rows.map((row) => ({ status: row.status, note: row.note, createdAt: row.created_at }));
}
