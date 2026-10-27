import type { Queryable } from '../db/client.js';
import type { AppRole, MemberStatus } from '../config/constants.js';

export interface AuthProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  photoPath: string | null;
  phone: string | null;
  city: string | null;
  profession: string | null;
  departmentInterestId: string | null;
  bio: string | null;
  status: MemberStatus;
  role: AppRole;
  consentPhotos: boolean;
  /** Le membre refuse les e-mails d'information (les transactionnels restent envoyes). */
  emailOptOut: boolean;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
}

export interface AuthContext {
  profile: AuthProfile;
  provider: 'local' | 'supabase';
  token: string;
}

export const isAdmin = (profile: AuthProfile): boolean =>
  profile.role === 'admin' && profile.status === 'approved';

export const isMedia = (profile: AuthProfile): boolean =>
  ['media', 'admin'].includes(profile.role) && profile.status === 'approved';

export const isApproved = (profile: AuthProfile): boolean => profile.status === 'approved';

/** Un admin peut tout ; un responsable uniquement ses departements. */
export async function canManageDepartment(
  db: Queryable,
  profile: AuthProfile,
  departmentId: string,
): Promise<boolean> {
  if (isAdmin(profile)) return true;
  if (!isApproved(profile)) return false;
  const { rows } = await db.query<{ allowed: boolean }>(
    `select exists (
       select 1 from public.departments d
       left join public.department_members dm
         on dm.department_id = d.id and dm.profile_id = $2 and dm.status = 'active'
       where d.id = $1
         and d.is_active
         and d.archived_at is null
         and (d.leader_id = $2 or dm.member_role in ('leader', 'assistant'))
     ) as allowed`,
    [departmentId, profile.id],
  );
  return rows[0]?.allowed ?? false;
}

export interface AlbumAccessShape {
  id: string;
  access: 'public' | 'members' | 'restricted';
  status: 'draft' | 'published' | 'archived';
}

/** Regle de visibilite d'un album, identique a la politique RLS `can_view_album`. */
export async function canViewAlbum(
  db: Queryable,
  profile: AuthProfile | null,
  album: AlbumAccessShape,
): Promise<boolean> {
  if (profile && isMedia(profile)) return true;
  if (album.status !== 'published') return false;
  if (album.access === 'public') return true;
  if (!profile || !isApproved(profile)) return false;
  if (album.access === 'members') return true;

  const { rows } = await db.query<{ allowed: boolean }>(
    `select exists (
       select 1 from public.album_access
       where album_id = $1 and profile_id = $2
     ) as allowed`,
    [album.id, profile.id],
  );
  return rows[0]?.allowed ?? false;
}

export function canDownloadAlbum(album: AlbumAccessShape): boolean {
  return album.access !== 'restricted';
}

export function assertCan(condition: boolean, message: string): void {
  if (!condition) {
    const error = new Error(message) as Error & { status: number; code: string };
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }
}
