import type { AppRole, MemberStatus } from '../../config/constants.js';
import type { AuthProfile } from '../../auth/permissions.js';

export interface ProfileRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  photo_path: string | null;
  phone: string | null;
  city: string | null;
  profession: string | null;
  department_interest_id: string | null;
  bio: string | null;
  status: MemberStatus;
  role: AppRole;
  consent_photos: boolean;
  submitted_at: Date | string | null;
  reviewed_at: Date | string | null;
  decision_note: string | null;
  created_at: Date | string;
  updated_at?: Date | string;
  last_login_at?: Date | string | null;
}

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
};

export function mapProfileRow(row: ProfileRow): AuthProfile {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    photoPath: row.photo_path,
    phone: row.phone,
    city: row.city,
    profession: row.profession,
    departmentInterestId: row.department_interest_id,
    bio: row.bio,
    status: row.status,
    role: row.role,
    consentPhotos: row.consent_photos,
    submittedAt: toDate(row.submitted_at),
    reviewedAt: toDate(row.reviewed_at),
    decisionNote: row.decision_note,
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

export interface PublicProfile {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  phone?: string | null;
  city: string | null;
  profession: string | null;
  bio: string | null;
  photoUrl: string | null;
  status?: MemberStatus;
  role?: AppRole;
  consentPhotos?: boolean;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  decisionNote?: string | null;
  createdAt?: string;
  departmentInterestId?: string | null;
}

/**
 * Vue « annuaire » : jamais d'e-mail, de telephone ni de statut.
 * Utilisee pour les listes visibles par les responsables de departement.
 */
export function toDirectoryProfile(profile: AuthProfile, photoUrl: string | null): PublicProfile {
  return {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    fullName: `${profile.firstName} ${profile.lastName}`.trim(),
    city: profile.city,
    profession: profile.profession,
    bio: profile.bio,
    photoUrl,
    departmentInterestId: profile.departmentInterestId,
  };
}

/** Vue complete : reservee au membre lui-meme et aux administrateurs. */
export function toFullProfile(profile: AuthProfile, photoUrl: string | null): PublicProfile {
  return {
    ...toDirectoryProfile(profile, photoUrl),
    email: profile.email,
    phone: profile.phone,
    status: profile.status,
    role: profile.role,
    consentPhotos: profile.consentPhotos,
    submittedAt: profile.submittedAt?.toISOString() ?? null,
    reviewedAt: profile.reviewedAt?.toISOString() ?? null,
    decisionNote: profile.decisionNote,
    createdAt: profile.createdAt.toISOString(),
  };
}
