import { getDatabase } from '../../db/client.js';
import { toDateOnly } from '../../utils/dates.js';
import type { AuthProfile } from '../../auth/permissions.js';
import type { DepartmentMemberRole } from './nominations-schemas.js';

/**
 * Historique des nominations dans les departements.
 *
 * Deux tables collaborent :
 *   - `department_members` porte l'affectation COURANTE (une ligne par membre et
 *     par departement, contrainte `status in ('active','left')`) ;
 *   - `department_nominations` conserve l'HISTORIQUE (une ligne par nomination,
 *     close par une date de fin et un motif).
 *
 * Pourquoi deux tables ? Une affectation courante doit rester unique et simple a
 * interroger pour les controles d'acces, alors que l'historique doit pouvoir
 * contenir plusieurs lignes pour le meme membre (nomme, puis remplace, puis
 * renomme). Cette separation evite de complexifier les requetes d'autorisation.
 */

export interface NominationInput {
  departmentId: string;
  profileId: string;
  memberRole: DepartmentMemberRole;
  functionTitle?: string | null;
  startedOn?: string | null;
}

export interface NominationDto {
  id: string;
  departmentId: string | null;
  departmentName: string;
  profileId: string;
  fullName: string;
  memberRole: string;
  functionTitle: string | null;
  startedOn: string;
  endedOn: string | null;
  status: 'active' | 'ended';
  endReason: string | null;
  appointedByName: string | null;
  createdAt: string;
}

/**
 * Ouvre une nomination et l'enregistre dans l'historique.
 *
 * Les nominations encore actives pour ce couple (departement, membre) sont
 * d'abord closes : un membre ne peut pas exercer deux fonctions simultanement
 * dans le meme departement. L'anciennete (`started_on`) est conservee si elle
 * est fournie, sinon la date du jour est utilisee.
 */
export async function openNomination(
  input: NominationInput,
  actor: AuthProfile,
): Promise<{ id: string }> {
  const db = getDatabase();

  // Le nom du departement est recopie dans l'historique : il reste lisible meme
  // si le departement est supprime par la suite.
  const department = await db.query<{ name: string }>(
    'select name from public.departments where id = $1',
    [input.departmentId],
  );
  if (!department.rows[0]) {
    throw new Error('Departement introuvable.');
  }
  const departmentName = department.rows[0].name;

  const startedOn = input.startedOn ?? new Date().toISOString().slice(0, 10);

  // 1. Clore les nominations encore actives pour ce membre dans ce departement.
  await db.query(
    `update public.department_nominations
        set status = 'ended',
            ended_on = coalesce(ended_on, $3::date),
            ended_by = $4,
            end_reason = coalesce(end_reason, 'Remplace par une nouvelle nomination')
      where department_id = $1 and profile_id = $2 and status = 'active'`,
    [input.departmentId, input.profileId, startedOn, actor.id],
  );

  // 2. Enregistrer la nouvelle nomination.
  const { rows } = await db.query<{ id: string }>(
    `insert into public.department_nominations
       (department_id, department_name, profile_id, member_role, function_title,
        started_on, status, appointed_by)
     values ($1, $2, $3, $4, $5, $6::date, 'active', $7)
     returning id`,
    [
      input.departmentId,
      departmentName,
      input.profileId,
      input.memberRole,
      input.functionTitle ?? null,
      startedOn,
      actor.id,
    ],
  );

  return { id: rows[0]?.id };
}

/**
 * Cloture la nomination active d'un membre dans un departement.
 *
 * Retourne `false` lorsqu'aucune nomination active n'existe, ce qui permet a
 * l'appelant de rester idempotent (retrait d'un membre deja parti).
 */
export async function closeNomination(
  params: { departmentId: string; profileId: string; reason?: string | null },
  actor: AuthProfile,
): Promise<boolean> {
  const db = getDatabase();
  const { rowCount } = await db.query(
    `update public.department_nominations
        set status = 'ended',
            ended_on = coalesce(ended_on, current_date),
            ended_by = $3,
            end_reason = $4
      where department_id = $1 and profile_id = $2 and status = 'active'`,
    [params.departmentId, params.profileId, actor.id, params.reason ?? 'Fin de fonction'],
  );
  return (rowCount ?? 0) > 0;
}

/** Historique complet d'un departement, du plus recent au plus ancien. */
export async function listDepartmentNominations(departmentId: string): Promise<NominationDto[]> {
  const db = getDatabase();
  const { rows } = await db.query<NominationRow>(
    `${NOMINATION_SELECT}
      where n.department_id = $1
      order by n.started_on desc, n.created_at desc`,
    [departmentId],
  );
  return rows.map(mapNomination);
}

/** Historique des fonctions exercees par un membre, tous departements confondus. */
export async function listProfileNominations(profileId: string): Promise<NominationDto[]> {
  const db = getDatabase();
  const { rows } = await db.query<NominationRow>(
    `${NOMINATION_SELECT}
      where n.profile_id = $1
      order by n.started_on desc, n.created_at desc`,
    [profileId],
  );
  return rows.map(mapNomination);
}

const NOMINATION_SELECT = `
  select n.id, n.department_id, n.department_name, n.profile_id,
         n.member_role, n.function_title, n.started_on, n.ended_on,
         n.status, n.end_reason, n.created_at,
         trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')) as appointed_by_name,
         trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as full_name
    from public.department_nominations n
    join public.profiles p on p.id = n.profile_id
    left join public.profiles a on a.id = n.appointed_by`;

interface NominationRow {
  id: string;
  department_id: string | null;
  department_name: string;
  profile_id: string;
  full_name: string;
  member_role: string;
  function_title: string | null;
  started_on: string;
  ended_on: string | null;
  status: 'active' | 'ended';
  end_reason: string | null;
  appointed_by_name: string | null;
  created_at: string;
}

function mapNomination(row: NominationRow): NominationDto {
  return {
    id: row.id,
    departmentId: row.department_id,
    departmentName: row.department_name,
    profileId: row.profile_id,
    fullName: row.full_name,
    memberRole: row.member_role,
    functionTitle: row.function_title,
    startedOn: toDateOnly(row.started_on) ?? '',
    endedOn: toDateOnly(row.ended_on),
    status: row.status,
    endReason: row.end_reason,
    appointedByName: row.appointed_by_name || null,
    createdAt: row.created_at,
  };
}
