import { z } from 'zod';
import { getDatabase } from '../../db/client.js';
import { toDateOnly } from '../../utils/dates.js';
import type { AuthProfile } from '../../auth/permissions.js';
import { getStorage } from '../../storage/index.js';
import { uniqueSlug } from '../../utils/slug.js';
import { recordAudit } from '../../middlewares/audit.js';

export interface DepartmentRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  mission: string | null;
  image_path: string | null;
  leader_id: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  meeting_location: string | null;
  contact: string | null;
  sort_order: number;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export const departmentInputSchema = z.object({
  name: z.string().trim().min(2, 'Nom requis.').max(120),
  description: z.string().trim().max(2000).nullish(),
  mission: z.string().trim().max(2000).nullish(),
  leaderId: z.string().uuid().nullish(),
  meetingDay: z.string().trim().max(40).nullish(),
  meetingTime: z.string().trim().max(60).nullish(),
  meetingLocation: z.string().trim().max(120).nullish(),
  contact: z.string().trim().max(120).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export type DepartmentInput = z.infer<typeof departmentInputSchema>;

export interface DepartmentDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  mission: string | null;
  imageUrl: string | null;
  leader: { id: string; fullName: string } | null;
  meetingDay: string | null;
  meetingTime: string | null;
  meetingLocation: string | null;
  contact: string | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: string | null;
  memberCount: number;
  createdAt: string;
}

interface DepartmentJoinedRow extends DepartmentRow {
  leader_first_name?: string | null;
  leader_last_name?: string | null;
  member_count?: string | number;
}

async function mapDepartment(row: DepartmentJoinedRow): Promise<DepartmentDto> {
  const storage = getStorage();
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    mission: row.mission,
    imageUrl: row.image_path ? await storage.publicUrl(row.image_path) : null,
    leader:
      row.leader_id
        ? {
            id: row.leader_id,
            fullName: `${row.leader_first_name ?? ''} ${row.leader_last_name ?? ''}`.trim(),
          }
        : null,
    meetingDay: row.meeting_day,
    meetingTime: row.meeting_time,
    meetingLocation: row.meeting_location,
    contact: row.contact,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    archivedAt: row.archived_at,
    memberCount: Number(row.member_count ?? 0),
    createdAt: row.created_at,
  };
}

const SELECT_BASE = `
  select d.*, l.first_name as leader_first_name, l.last_name as leader_last_name,
    (select count(*) from public.department_members dm
      where dm.department_id = d.id and dm.status = 'active') as member_count
  from public.departments d
  left join public.profiles l on l.id = d.leader_id
`;

export async function listDepartments(options: {
  includeInactive?: boolean;
  includeArchived?: boolean;
  publicOnly?: boolean;
} = {}): Promise<DepartmentDto[]> {
  const db = getDatabase();
  const where: string[] = [];
  if (options.publicOnly) {
    where.push('d.is_active = true', 'd.archived_at is null');
  } else {
    if (!options.includeInactive) where.push('d.is_active = true');
    if (!options.includeArchived) where.push('d.archived_at is null');
  }
  const { rows } = await db.query<DepartmentJoinedRow>(
    `${SELECT_BASE} ${where.length ? `where ${where.join(' and ')}` : ''}
     order by d.sort_order asc, d.name asc`,
  );
  return Promise.all(rows.map(mapDepartment));
}

export async function getDepartmentBySlug(slug: string): Promise<DepartmentDto | null> {
  const db = getDatabase();
  const { rows } = await db.query<DepartmentJoinedRow>(
    `${SELECT_BASE} where d.slug = $1 and d.is_active and d.archived_at is null`,
    [slug],
  );
  return rows[0] ? mapDepartment(rows[0]) : null;
}

export async function getDepartmentById(id: string): Promise<DepartmentDto | null> {
  const db = getDatabase();
  const { rows } = await db.query<DepartmentJoinedRow>(`${SELECT_BASE} where d.id = $1`, [id]);
  return rows[0] ? mapDepartment(rows[0]) : null;
}

export async function createDepartment(
  input: DepartmentInput,
  actor: AuthProfile,
): Promise<DepartmentDto> {
  const db = getDatabase();
  const slug = await uniqueSlug(db, 'departments', input.name);
  const { rows } = await db.query<DepartmentRow>(
    `insert into public.departments
       (name, slug, description, mission, leader_id, meeting_day, meeting_time,
        meeting_location, contact, sort_order, is_active)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning *`,
    [
      input.name,
      slug,
      input.description ?? null,
      input.mission ?? null,
      input.leaderId ?? null,
      input.meetingDay ?? null,
      input.meetingTime ?? null,
      input.meetingLocation ?? null,
      input.contact ?? null,
      input.sortOrder ?? 0,
      input.isActive ?? true,
    ],
  );
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'department.create',
    entityType: 'department',
    entityId: rows[0].id,
    metadata: { name: input.name },
  });
  return (await getDepartmentById(rows[0].id))!;
}

export async function updateDepartment(
  id: string,
  input: Partial<DepartmentInput> & { imagePath?: string | null },
  actor: AuthProfile,
): Promise<DepartmentDto> {
  const db = getDatabase();
  const { rows } = await db.query<DepartmentRow>(
    `update public.departments set
       name = coalesce($2, name),
       description = case when $3::boolean then $4 else description end,
       mission = case when $5::boolean then $6 else mission end,
       leader_id = case when $7::boolean then $8::uuid else leader_id end,
       meeting_day = case when $9::boolean then $10 else meeting_day end,
       meeting_time = case when $11::boolean then $12 else meeting_time end,
       meeting_location = case when $13::boolean then $14 else meeting_location end,
       contact = case when $15::boolean then $16 else contact end,
       sort_order = coalesce($17, sort_order),
       is_active = coalesce($18, is_active),
       image_path = case when $19::boolean then $20 else image_path end
     where id = $1
     returning *`,
    [
      id,
      input.name ?? null,
      input.description !== undefined,
      input.description ?? null,
      input.mission !== undefined,
      input.mission ?? null,
      input.leaderId !== undefined,
      input.leaderId ?? null,
      input.meetingDay !== undefined,
      input.meetingDay ?? null,
      input.meetingTime !== undefined,
      input.meetingTime ?? null,
      input.meetingLocation !== undefined,
      input.meetingLocation ?? null,
      input.contact !== undefined,
      input.contact ?? null,
      input.sortOrder ?? null,
      input.isActive ?? null,
      input.imagePath !== undefined,
      input.imagePath ?? null,
    ],
  );
  if (!rows[0]) throw Object.assign(new Error('Departement introuvable.'), { status: 404, code: 'NOT_FOUND' });
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'department.update',
    entityType: 'department',
    entityId: id,
    metadata: { fields: Object.keys(input) },
  });
  return (await getDepartmentById(id))!;
}

export async function archiveDepartment(id: string, actor: AuthProfile): Promise<void> {
  const db = getDatabase();
  await db.query(
    `update public.departments set is_active = false, archived_at = now() where id = $1`,
    [id],
  );
  // Un departement archive ne peut plus etre pilote : les fonctions en cours sont
  // cloturees, mais les lignes d'affectation et l'historique sont conserves.
  await db.query(
    `update public.department_members
        set status = 'left', ended_on = coalesce(ended_on, current_date)
      where department_id = $1 and status = 'active'`,
    [id],
  );
  await db.query(
    `update public.department_nominations
        set status = 'ended',
            ended_on = coalesce(ended_on, current_date),
            ended_by = $2,
            end_reason = coalesce(end_reason, 'Departement archive')
      where department_id = $1 and status = 'active'`,
    [id, actor.id],
  );
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'department.archive',
    entityType: 'department',
    entityId: id,
  });
}

export interface DepartmentMemberDto {
  profileId: string;
  fullName: string;
  email?: string;
  city: string | null;
  role: string;
  status: string;
  /** Date d'entree dans la fonction (periode d'exercice courante). */
  startedOn: string | null;
  /** Intitule libre de la fonction, si l'administrateur en a saisi un. */
  functionTitle: string | null;
  joinedAt: string;
}

export async function listDepartmentMembers(departmentId: string): Promise<DepartmentMemberDto[]> {
  const db = getDatabase();
  const { rows } = await db.query<{
    profile_id: string;
    first_name: string | null;
    last_name: string | null;
    city: string | null;
    member_role: string;
    status: string;
    started_on: string | null;
    function_title: string | null;
    joined_at: string;
  }>(
    `select dm.profile_id, p.first_name, p.last_name, p.city, dm.member_role, dm.status,
            dm.started_on, dm.function_title, dm.joined_at
     from public.department_members dm
     join public.profiles p on p.id = dm.profile_id
     where dm.department_id = $1 and dm.status = 'active'
     order by (dm.member_role = 'leader') desc, dm.joined_at asc`,
    [departmentId],
  );
  return rows.map((row) => ({
    profileId: row.profile_id,
    fullName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    city: row.city,
    role: row.member_role,
    status: row.status,
    startedOn: toDateOnly(row.started_on),
    functionTitle: row.function_title,
    joinedAt: row.joined_at,
  }));
}
