import { randomBytes, randomUUID } from 'node:crypto';
import type { Database } from '../db/client.js';
import { hashPassword, passwordIssues } from './password.js';
import { normalizeEmail } from './bootstrap.js';
import { recordAudit } from '../middlewares/audit.js';

/**
 * Compte de démonstration.
 *
 * Contrairement au compte principal (`initSuperAdmin`), ce compte n'ouvre
 * aucun privilège particulier : il est créé approuvé, avec un rôle choisi
 * (`member` par défaut) et un mot de passe connu, pour servir de bac à sable.
 *
 * Il est **modifiable ensuite** par les moyens habituels de l'application :
 *   - le membre modifie son profil dans l'espace membre ;
 *   - un administrateur modifie son rôle, son statut ou ses restrictions
 *     depuis `/admin/members` ;
 *   - le titulaire change son mot de passe via `POST /auth/password`.
 *
 * Garde-fous appliqués ici :
 *   - jamais de doublon : une adresse existante est réutilisée, jamais dupliquée ;
 *   - un compte administrateur existant n'est **jamais** rétrogradé par ce
 *     script (sinon une simple faute de frappe retirerait le compte principal) ;
 *   - la modification d'un compte existant exige `reset: true`, pour qu'une
 *     commande lancée par habitude ne change pas silencieusement un rôle ;
 *   - le mot de passe n'est stocké que sous forme de dérivé scrypt ;
 *   - l'opération est journalisée (audit + historique d'adhésion).
 */

export const DEMO_ROLES = ['member', 'department_leader', 'media', 'admin'] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export const DEMO_ROLE_LABEL: Record<DemoRole, string> = {
  member: 'Membre',
  department_leader: 'Responsable de département',
  media: 'Équipe média',
  admin: 'Administrateur',
};

export interface DemoAccountOptions {
  email: string;
  password: string;
  /** Rôle attribué. `member` par défaut : un compte de démonstration n'a pas à être puissant. */
  role?: DemoRole;
  firstName?: string;
  lastName?: string;
  /** Autorise la mise à jour d'un compte existant (rôle, statut, mot de passe). */
  reset?: boolean;
}

export type DemoAccountResult =
  | { action: 'created'; profileId: string; email: string; role: DemoRole }
  | { action: 'updated'; profileId: string; email: string; role: DemoRole; changes: string[] }
  | { action: 'unchanged'; profileId: string; email: string; role: DemoRole };

export class DemoAccountError extends Error {
  constructor(
    message: string,
    /** Indication actionnable affichée à l'opérateur. */
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'DemoAccountError';
  }
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Mot de passe de démonstration lisible et suffisamment solide.
 *
 * Le suffixe est fixe pour garantir la présence d'une lettre, d'un chiffre et
 * d'un symbole quelle que soit la sortie aléatoire — la politique de mot de
 * passe exige les deux premiers.
 */
export function generateDemoPassword(): string {
  return `${randomBytes(9).toString('base64url')}a1!`;
}

function validateEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new DemoAccountError('Adresse e-mail invalide.');
  }
  return normalized;
}

function validateRole(role: string): DemoRole {
  if (!(DEMO_ROLES as readonly string[]).includes(role)) {
    throw new DemoAccountError(
      `Rôle inconnu : « ${role} ».`,
      `Rôles acceptés : ${DEMO_ROLES.join(', ')}.`,
    );
  }
  return role as DemoRole;
}

interface ExistingAccount {
  id: string;
  email: string;
  role: string;
  status: string;
}

/** Crée — ou met à jour — un compte de démonstration. */
export async function createDemoAccount(
  db: Database,
  options: DemoAccountOptions,
): Promise<DemoAccountResult> {
  const email = validateEmail(options.email);
  const role = validateRole(options.role ?? 'member');
  const firstName = (options.firstName ?? 'Compte').trim() || 'Compte';
  const lastName = (options.lastName ?? 'Démo').trim() || 'Démo';

  const issues = passwordIssues(options.password);
  if (issues.length > 0) {
    throw new DemoAccountError(
      `Mot de passe trop faible : il manque ${issues.join(', ')}.`,
      'Au moins 10 caractères, avec une lettre et un chiffre.',
    );
  }

  const { rows } = await db.query<ExistingAccount>(
    'select id, email, role, status from public.profiles where lower(email) = $1 limit 1',
    [email],
  );
  const existing = rows[0];

  // ---------------------------------------------------------------------------
  // Cas 1 : l'adresse appartient déjà à un administrateur
  // ---------------------------------------------------------------------------
  if (existing && existing.role === 'admin' && role !== 'admin') {
    throw new DemoAccountError(
      `${email} est un compte administrateur : ce script ne le rétrograde pas.`,
      'Choisissez une autre adresse pour le compte de démonstration, ou retirez le rôle d’administrateur depuis l’interface.',
    );
  }

  // ---------------------------------------------------------------------------
  // Cas 2 : le compte existe déjà
  // ---------------------------------------------------------------------------
  if (existing) {
    const changes: string[] = [];

    if (!options.reset) {
      return { action: 'unchanged', profileId: existing.id, email, role: existing.role as DemoRole };
    }

    const passwordHash = await hashPassword(options.password);
    await db.transaction(async (tx) => {
      if (existing.role !== role) changes.push(`rôle : ${existing.role} → ${role}`);
      if (existing.status !== 'approved') {
        changes.push(`statut : ${existing.status} → approved`);
      }
      changes.push('mot de passe remplacé');

      await tx.query(
        `update auth.users set encrypted_password = $2, email_confirmed_at = now()
          where id = $1`,
        [existing.id, passwordHash],
      );
      await tx.query(
        `update public.profiles
            set role = $2, status = 'approved', reviewed_at = coalesce(reviewed_at, now()),
                updated_at = now()
          where id = $1`,
        [existing.id, role],
      );
      await tx.query(
        `insert into public.membership_history (profile_id, status, note)
         values ($1, 'approved', $2)`,
        [existing.id, `Mise à jour du compte de démonstration (${changes.join(', ')})`],
      );
    });

    await recordAudit(db, {
      actorEmail: email,
      action: 'demo.account_updated',
      entityType: 'profile',
      entityId: existing.id,
      metadata: { role, changes },
    });

    return { action: 'updated', profileId: existing.id, email, role, changes };
  }

  // ---------------------------------------------------------------------------
  // Cas 3 : création
  // ---------------------------------------------------------------------------
  const passwordHash = await hashPassword(options.password);
  const userId = randomUUID();

  const profileId = await db.transaction(async (tx) => {
    await tx.query(
      `insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, $3, now(), $4)`,
      [userId, email, passwordHash, JSON.stringify({ first_name: firstName, last_name: lastName })],
    );
    await tx.query(
      `insert into public.profiles (id, email, first_name, last_name, status, role, bio, reviewed_at)
       values ($1, $2, $3, $4, 'approved', $5, $6, now())`,
      [userId, email, firstName, lastName, role, 'Compte de démonstration — librement modifiable.'],
    );
    await tx.query(
      `insert into public.membership_history (profile_id, status, note)
       values ($1, 'approved', 'Création du compte de démonstration')`,
      [userId],
    );
    return userId;
  });

  await recordAudit(db, {
    actorEmail: email,
    action: 'demo.account_created',
    entityType: 'profile',
    entityId: profileId,
    metadata: { role },
  });

  return { action: 'created', profileId, email, role };
}
