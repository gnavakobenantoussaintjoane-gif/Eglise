/** Constantes metier partagees (roles, statuts, libelles). */

export const MEMBER_STATUSES = [
  'profile_incomplete',
  'pending_review',
  'approved',
  'rejected',
  'suspended',
] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  profile_incomplete: 'Profil incomplet',
  pending_review: 'En attente de validation',
  approved: 'Membre approuve',
  rejected: 'Demande refusee',
  suspended: 'Compte suspendu',
};

export const APP_ROLES = ['member', 'department_leader', 'media', 'admin'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  member: 'Membre',
  department_leader: 'Responsable de departement',
  media: 'Equipe media',
  admin: 'Administrateur',
};

export const ALBUM_ACCESS_LEVELS = ['public', 'members', 'restricted'] as const;
export type AlbumAccessLevel = (typeof ALBUM_ACCESS_LEVELS)[number];

export const ALBUM_STATUSES = ['draft', 'published', 'archived'] as const;
export type AlbumStatus = (typeof ALBUM_STATUSES)[number];

/** Un role de niveau >= media peut gerer la galerie. */
export const MEDIA_ROLES: AppRole[] = ['media', 'admin'];

export const ALLOWED_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;

export const ALLOWED_AUDIO_MIME = [
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
] as const;

export const ALLOWED_DOCUMENT_MIME = ['application/pdf'] as const;

export const UPLOAD_KINDS = {
  image: [...ALLOWED_IMAGE_MIME],
  audio: [...ALLOWED_AUDIO_MIME],
  document: [...ALLOWED_DOCUMENT_MIME],
} as const;
