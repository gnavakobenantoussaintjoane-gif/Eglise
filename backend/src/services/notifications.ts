import type { Queryable } from '../db/client.js';

export interface NotificationInput {
  title: string;
  body?: string | null;
  link?: string | null;
  type: string;
}

export async function notifyProfiles(
  db: Queryable,
  profileIds: string[],
  input: NotificationInput,
): Promise<void> {
  const unique = [...new Set(profileIds)].filter(Boolean);
  if (unique.length === 0) return;
  for (const profileId of unique) {
    await db.query(
      `insert into public.notifications (profile_id, type, title, body, link)
       values ($1, $2, $3, $4, $5)`,
      [profileId, input.type, input.title, input.body ?? null, input.link ?? null],
    );
  }
}

/** Notifie tous les administrateurs actifs (jamais les membres). */
export async function notifyAdmins(
  db: Queryable,
  input: NotificationInput,
): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `select id from public.profiles
     where role = 'admin' and status = 'approved'`,
  );
  await notifyProfiles(
    db,
    rows.map((row) => row.id),
    input,
  );
}

/** Notifie les responsables (leader / assistant) d'un departement. */
export async function notifyDepartmentLeaders(
  db: Queryable,
  departmentId: string,
  input: NotificationInput,
): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `select d.leader_id as id from public.departments d where d.id = $1 and d.leader_id is not null
     union
     select dm.profile_id as id from public.department_members dm
     where dm.department_id = $1 and dm.status = 'active' and dm.member_role in ('leader', 'assistant')`,
    [departmentId],
  );
  await notifyProfiles(
    db,
    rows.map((row) => row.id),
    input,
  );
}
