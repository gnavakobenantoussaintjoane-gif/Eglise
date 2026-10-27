import { isAdmin, isApproved, isMedia, type AuthProfile } from '../auth/permissions.js';
import { toFullProfile, type PublicProfile } from '../modules/profiles/mapper.js';
import { signedFileUrl } from './files.js';

export interface Permissions {
  isAdmin: boolean;
  isMedia: boolean;
  isApproved: boolean;
  canAccessMembersArea: boolean;
  canManageGallery: boolean;
  canManageDepartments: boolean;
}

export function permissionsFor(profile: AuthProfile): Permissions {
  const admin = isAdmin(profile);
  const media = isMedia(profile);
  return {
    isAdmin: admin,
    isMedia: media,
    isApproved: isApproved(profile),
    canAccessMembersArea: isApproved(profile),
    canManageGallery: media,
    canManageDepartments: admin || profile.role === 'department_leader',
  };
}

export interface SessionPayload {
  profile: PublicProfile;
  permissions: Permissions;
  status: AuthProfile['status'];
}

export async function buildSession(profile: AuthProfile): Promise<SessionPayload> {
  const photoUrl = await signedFileUrl(profile.photoPath, 3600);
  return {
    profile: toFullProfile(profile, photoUrl),
    permissions: permissionsFor(profile),
    status: profile.status,
  };
}
