import { z } from 'zod';
import type { Database, Queryable } from '../../db/client.js';
import { AppError } from '../../utils/errors.js';

/**
 * Restrictions individuelles.
 *
 * Distinctes de la suspension du compte : un membre suspendu perd tout accès,
 * alors qu'une restriction retire UNE possibilité précise (publier un
 * témoignage, s'inscrire à un événement…) sans l'exclure de la communauté.
 *
 * Toutes les décisions sont prises par un administrateur, journalisées dans
 * l'audit, et le membre peut lire le motif depuis son profil.
 */

export const RESTRICTION_CODES = [
  'event_registration',
  'testimony_submission',
  'gallery_access',
  'directory_listing',
  'department_request',
] as const;

export type RestrictionCode = (typeof RESTRICTION_CODES)[number];

/** Libellés affichés dans l'interface d'administration et au membre. */
export const RESTRICTION_LABELS: Record<RestrictionCode, { label: string; description: string }> = {
  event_registration: {
    label: 'Inscription aux événements',
    description: 'Ne peut plus s’inscrire aux événements de l’église.',
  },
  testimony_submission: {
    label: 'Publication de témoignages',
    description: 'Ne peut plus soumettre de témoignage.',
  },
  gallery_access: {
    label: 'Accès à la galerie',
    description: 'Ne peut plus ouvrir les albums réservés aux membres.',
  },
  directory_listing: {
    label: 'Présence dans l’annuaire',
    description: 'N’apparaît plus dans l’annuaire des membres.',
  },
  department_request: {
    label: 'Demande de département',
    description: 'Ne peut plus demander à rejoindre un département.',
  },
};

export interface RestrictionEntry {
  code: RestrictionCode;
  label: string;
  description: string;
  reason: string | null;
  createdAt: string;
}

export const restrictionsInputSchema = z.object({
  codes: z.array(z.enum(RESTRICTION_CODES)).max(RESTRICTION_CODES.length),
  /** Motif communiqué au membre concerné. */
  reason: z.string().trim().max(500).nullish(),
});

export type RestrictionsInput = z.infer<typeof restrictionsInputSchema>;

/** Toutes les restrictions actives d'un profil (lecture seule). */
export async function listRestrictions(
  db: Queryable,
  profileId: string,
): Promise<RestrictionEntry[]> {
  const { rows } = await db.query<{
    code: RestrictionCode;
    reason: string | null;
    created_at: Date | string;
  }>(
    `select code, reason, created_at
       from public.profile_restrictions
      where profile_id = $1
      order by created_at asc`,
    [profileId],
  );

  return rows.map((row) => ({
    code: row.code,
    label: RESTRICTION_LABELS[row.code]?.label ?? row.code,
    description: RESTRICTION_LABELS[row.code]?.description ?? '',
    reason: row.reason,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/** Ensemble des codes actifs — utilisé aux points de contrôle. */
export async function activeRestrictions(
  db: Queryable,
  profileId: string,
): Promise<Set<RestrictionCode>> {
  const { rows } = await db.query<{ code: RestrictionCode }>(
    'select code from public.profile_restrictions where profile_id = $1',
    [profileId],
  );
  return new Set(rows.map((row) => row.code));
}

/**
 * Refuse l'action si la restriction est active.
 *
 * Le message est explicite et destiné au membre : il indique la possibilité
 * concernée et le motif éventuel, sans révéler d'information interne.
 */
export async function assertNotRestricted(
  db: Queryable,
  profileId: string,
  code: RestrictionCode,
): Promise<void> {
  const { rows } = await db.query<{ reason: string | null }>(
    'select reason from public.profile_restrictions where profile_id = $1 and code = $2',
    [profileId, code],
  );
  const restriction = rows[0];
  if (!restriction) return;

  const { label } = RESTRICTION_LABELS[code];
  const detail = restriction.reason?.trim();
  throw AppError.forbidden(
    detail
      ? `${label} : cette possibilité vous a été retirée par l’administration. Motif indiqué : ${detail}`
      : `${label} : cette possibilité vous a été retirée par l’administration.`,
  );
}

/**
 * Remplace l'ensemble des restrictions d'un membre.
 *
 * Règles de sécurité appliquées ici, pas seulement dans l'interface :
 *   - la cible doit exister ;
 *   - un compte administrateur ne peut pas être restreint (sinon un
 *     administrateur pourrait neutraliser les autres) ;
 *   - la personne ne peut pas se restreindre elle-même par erreur : la cible
 *     d'un administrateur est forcément un autre compte.
 *
 * Retourne les codes effectivement ajoutés et retirés, pour l'audit.
 */
export async function setRestrictions(
  db: Database,
  profileId: string,
  input: RestrictionsInput,
  actorId: string,
): Promise<{ added: RestrictionCode[]; removed: RestrictionCode[]; current: RestrictionCode[] }> {
  const target = await db.query<{ id: string; role: string; status: string }>(
    'select id, role, status from public.profiles where id = $1',
    [profileId],
  );
  const profile = target.rows[0];
  if (!profile) throw AppError.notFound('Membre introuvable.');

  if (profile.id === actorId) {
    throw AppError.badRequest(
      'Vous ne pouvez pas appliquer de restriction à votre propre compte.',
    );
  }
  if (profile.role === 'admin') {
    throw AppError.badRequest(
      'Un compte administrateur ne peut pas être restreint. Retirez d’abord son rôle d’administrateur.',
    );
  }
  if (profile.status !== 'approved') {
    throw AppError.badRequest(
      'Les restrictions ne s’appliquent qu’aux membres approuvés. Utilisez le statut du compte pour les autres cas.',
    );
  }

  // Un code en double dans la requête ne doit pas provoquer d'erreur SQL.
  const wanted = [...new Set(input.codes)];
  const before = await activeRestrictions(db, profileId);
  const added = wanted.filter((code) => !before.has(code));
  const removed = [...before].filter((code) => !wanted.includes(code));

  await db.transaction(async (tx) => {
    if (removed.length > 0) {
      await tx.query(
        'delete from public.profile_restrictions where profile_id = $1 and code = any($2::text[])',
        [profileId, removed],
      );
    }
    for (const code of added) {
      await tx.query(
        `insert into public.profile_restrictions (profile_id, code, reason, created_by)
         values ($1, $2, $3, $4)
         on conflict (profile_id, code) do update
           set reason = excluded.reason, created_by = excluded.created_by`,
        [profileId, code, input.reason ?? null, actorId],
      );
    }
    // Le motif est commun : on l'applique aussi aux restrictions conservées.
    if (input.reason !== undefined && wanted.length > 0) {
      await tx.query(
        `update public.profile_restrictions set reason = $2
          where profile_id = $1 and code = any($3::text[])`,
        [profileId, input.reason ?? null, wanted],
      );
    }
  });

  return { added, removed, current: wanted };
}
