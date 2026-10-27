import { format, formatDistanceToNow, isSameDay, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { AlbumStatus, AlbumAccess, AppRole, MemberStatus } from '../types';

const toDate = (value: string | Date): Date => (typeof value === 'string' ? parseISO(value) : value);

export function formatDate(value: string | Date, pattern = 'd MMMM yyyy'): string {
  try {
    return format(toDate(value), pattern, { locale: fr });
  } catch {
    return '—';
  }
}

export function formatDateTime(value: string | Date): string {
  return formatDate(value, "d MMMM yyyy 'à' HH'h'mm");
}

export function formatTime(value: string | Date): string {
  return formatDate(value, 'HH:mm');
}

export function formatRelative(value: string | Date): string {
  try {
    return formatDistanceToNow(toDate(value), { addSuffix: true, locale: fr });
  } catch {
    return '—';
  }
}

export function formatDateRange(start: string, end: string | null): string {
  if (!end) return formatDateTime(start);
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (isSameDay(startDate, endDate)) {
    return `${formatDate(startDate)} · ${formatTime(startDate)} – ${formatTime(endDate)}`;
  }
  return `${formatDateTime(start)} → ${formatDateTime(end)}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

export function formatCurrency(value: number, currency = 'XOF'): string {
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${formatNumber(value)} ${currency}`;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  try {
    return format(toDate(value), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

export function toDateTimeInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  try {
    return format(toDate(value), "yyyy-MM-dd'T'HH:mm");
  } catch {
    return '';
  }
}

export function initials(firstName?: string, lastName?: string): string {
  const first = firstName?.trim().charAt(0) ?? '';
  const last = lastName?.trim().charAt(0) ?? '';
  return `${first}${last}`.toUpperCase() || '?';
}

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  profile_incomplete: 'Profil incomplet',
  pending_review: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
  suspended: 'Suspendu',
};

export const MEMBER_STATUS_TONE: Record<
  MemberStatus,
  'neutral' | 'warning' | 'success' | 'danger' | 'info'
> = {
  profile_incomplete: 'neutral',
  pending_review: 'warning',
  approved: 'success',
  rejected: 'danger',
  suspended: 'danger',
};

export const ROLE_LABEL: Record<AppRole, string> = {
  member: 'Membre',
  department_leader: 'Responsable de département',
  media: 'Équipe média',
  admin: 'Administrateur',
};

export const ALBUM_ACCESS_LABEL: Record<AlbumAccess, string> = {
  public: 'Public',
  members: 'Membres',
  restricted: 'Accès restreint',
};

export const ALBUM_STATUS_LABEL: Record<AlbumStatus, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  archived: 'Archivé',
};

export const ALBUM_STATUS_TONE: Record<AlbumStatus, 'neutral' | 'success' | 'warning'> = {
  draft: 'warning',
  published: 'success',
  archived: 'neutral',
};
