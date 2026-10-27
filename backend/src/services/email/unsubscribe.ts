import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { getDatabase } from '../../db/client.js';

/**
 * Desinscription en un clic des messages d'information.
 *
 * Un lien de desinscription doit fonctionner sans que la personne soit
 * connectee : on ne peut donc pas se contenter d'un identifiant de profil dans
 * l'URL (n'importe qui pourrait desinscrire n'importe qui). Le lien porte un
 * jeton **signe** (HMAC-SHA256 avec `SESSION_SECRET`) qui lie l'identifiant du
 * profil a l'application.
 *
 * La page de desinscription demande une confirmation (POST) plutot que
 * d'agir sur un simple GET : certains antivirus et filtres antispam ouvrent
 * automatiquement les liens d'un e-mail, ce qui desinscrirait des membres sans
 * leur accord.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Duree de validite d'un jeton de desinscription : 180 jours. */
const TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;

function sign(payload: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
}

/**
 * Construit un jeton `base64url(<profil>:<expiration>)` + `.` + signature.
 * L'identifiant et l'expiration sont signes ensemble : impossible de prolonger
 * un jeton sans le secret du serveur.
 */
export function createUnsubscribeToken(profileId: string, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + TOKEN_TTL_SECONDS;
  const payload = Buffer.from(`${profileId}:${expiresAt}`, 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export type UnsubscribeCheck =
  | { valid: true; profileId: string }
  | { valid: false; reason: 'malformed' | 'signature' | 'expired' };

/** Verifie un jeton sans effet de bord. Comparaison a temps constant. */
export function verifyUnsubscribeToken(token: string, now = Date.now()): UnsubscribeCheck {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { valid: false, reason: 'malformed' };
  const [payload, signature] = parts;

  const expected = sign(payload);
  const given = Buffer.from(signature);
  const reference = Buffer.from(expected);
  if (given.length !== reference.length || !timingSafeEqual(given, reference)) {
    return { valid: false, reason: 'signature' };
  }

  let decoded: string;
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  const [profileId, expiresRaw] = decoded.split(':');
  const expiresAt = Number(expiresRaw);
  // Le format est verifie ici : un identifiant non-uuid n'atteint jamais la
  // base (sinon PostgreSQL renvoie un message technique a l'utilisateur).
  if (!profileId || !UUID_PATTERN.test(profileId) || !Number.isFinite(expiresAt)) {
    return { valid: false, reason: 'malformed' };
  }
  if (expiresAt * 1000 < now) return { valid: false, reason: 'expired' };

  return { valid: true, profileId };
}

export interface UnsubscribeTarget {
  profileId: string;
  /** Adresse partiellement masquee, seule information renvoyee a la page. */
  maskedEmail: string;
  alreadyUnsubscribed: boolean;
}

/** Masque une adresse : `joannegnava@gmail.com` → `jo***@gmail.com`. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'adresse inconnue';
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, Math.min(6, local.length - 2)))}@${domain}`;
}

/** Lit la cible d'un jeton, sans modifier la base. */
export async function inspectUnsubscribeToken(token: string): Promise<UnsubscribeTarget> {
  const check = verifyUnsubscribeToken(token);
  if (!check.valid) {
    const messages = {
      malformed: 'Lien de desinscription invalide.',
      signature: 'Lien de desinscription invalide.',
      expired: 'Ce lien de desinscription a expire. Modifiez vos preferences depuis votre profil.',
    };
    throw new Error(messages[check.reason]);
  }

  const db = getDatabase();
  const { rows } = await db.query<{ email: string; email_opt_out: boolean }>(
    'select email, email_opt_out from public.profiles where id = $1',
    [check.profileId],
  );
  const profile = rows[0];
  if (!profile) throw new Error('Ce compte n existe plus.');

  return {
    profileId: check.profileId,
    maskedEmail: maskEmail(profile.email),
    alreadyUnsubscribed: profile.email_opt_out,
  };
}

/**
 * Desinscrit le profil vise. Idempotent : un second appel ne change rien.
 * Retourne `true` si la preference a effectivement change.
 */
export async function unsubscribeFromToken(token: string): Promise<{
  target: UnsubscribeTarget;
  changed: boolean;
}> {
  const target = await inspectUnsubscribeToken(token);
  if (target.alreadyUnsubscribed) return { target, changed: false };

  const db = getDatabase();
  await db.query('update public.profiles set email_opt_out = true where id = $1', [
    target.profileId,
  ]);
  return { target: { ...target, alreadyUnsubscribed: true }, changed: true };
}
