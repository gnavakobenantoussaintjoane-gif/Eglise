import { isAdmin, isApproved, isMedia, type AuthProfile } from '../auth/permissions.js';
import { toFullProfile, type PublicProfile } from '../modules/profiles/mapper.js';
import { signedFileUrl } from './files.js';
import { getDatabase } from '../db/client.js';
import { listRestrictions, type RestrictionEntry } from '../modules/profiles/restrictions.js';
import { logger } from '../utils/logger.js';

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
  /**
   * Restrictions individuelles du membre connecté, avec leur motif.
   *
   * Exposées ici pour qu'il comprenne pourquoi une action lui est refusée au
   * lieu de rencontrer une erreur sans explication.
   */
  restrictions: RestrictionEntry[];
}

export async function buildSession(profile: AuthProfile): Promise<SessionPayload> {
  const photoUrl = await signedFileUrl(profile.photoPath, 3600);
  // Une base non migree ne doit pas empecher la connexion : on degrade en
  // journalisant l'incident plutot qu'en masquant l'erreur.
  let restrictions: RestrictionEntry[] = [];
  try {
    restrictions = await listRestrictions(getDatabase(), profile.id);
  } catch (error) {
    logger.warn('[restrictions] lecture impossible (migration 0008 appliquee ?)', error);
  }
  return {
    profile: toFullProfile(profile, photoUrl),
    permissions: permissionsFor(profile),
    status: profile.status,
    restrictions,
  };
}
