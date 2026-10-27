import { randomUUID } from 'node:crypto';
import type { Database, Queryable } from '../db/client.js';
import { hashPassword, passwordIssues } from './password.js';
import { recordAudit } from '../middlewares/audit.js';

/**
 * Initialisation du compte principal (pasteur / super administrateur).
 *
 * Ce module contient la logique, testable, de creation et de promotion du compte
 * principal. La saisie du mot de passe est faite par le script CLI
 * (`init-super-admin.ts`) via une invite masquee : le mot de passe n'apparait
 * jamais dans les arguments, l'environnement, un fichier ou un journal.
 *
 * Rappels de securite appliques ici :
 *   - le mot de passe n'est jamais stocke en clair : seul un derive scrypt est
 *     ecrit dans `auth.users.encrypted_password` ;
 *   - aucun doublon : un compte existant pour la meme adresse est reutilise,
 *     jamais duplique ;
 *   - pas d'elevation silencieuse : la promotion d'un compte existant exige une
 *     option explicite, et la creation d'un second administrateur aussi ;
 *   - toute operation est journalisee (historique d'adhesion + journal d'audit).
 *
 * Note d'architecture : cette application gere elle-meme ses comptes (hachage
 * scrypt et cookie de session signe, voir `local-provider.ts`). La table
 * `auth.users` lui sert de referentiel de comptes ; Supabase Auth (GoTrue) n'est
 * pas le fournisseur d'authentification actif. Creer un utilisateur dans le
 * tableau de bord Supabase ne donnerait donc PAS acces a l'application.
 */

export interface BootstrapOptions {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  /** Autorise la promotion d'un compte existant qui n'est pas encore administrateur. */
  promote?: boolean;
  /** Autorise le changement de mot de passe d'un compte deja administrateur. */
  resetPassword?: boolean;
  /** Autorise la creation alors qu'un autre administrateur existe deja. */
  allowAdditionalAdmin?: boolean;
}

export type BootstrapResult =
  | { action: 'created'; profileId: string; email: string }
  | { action: 'promoted'; profileId: string; email: string }
  | { action: 'password_updated'; profileId: string; email: string }
  | { action: 'already_admin'; profileId: string; email: string };

export class BootstrapError extends Error {
  constructor(
    message: string,
    /** Indication actionnable affichee a l'operateur. */
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'BootstrapError';
  }
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Verifie les entrees avant toute ecriture. Leve une erreur explicite sinon. */
export function validateBootstrapInput(options: BootstrapOptions): string {
  const email = normalizeEmail(options.email);
  if (!EMAIL_PATTERN.test(email)) {
    throw new BootstrapError('Adresse e-mail invalide.');
  }
  const issues = passwordIssues(options.password);
  if (issues.length > 0) {
    throw new BootstrapError(
      `Mot de passe trop faible : il manque ${issues.join(', ')}.`,
      'Choisissez au moins 12 caracteres melangeant lettres, chiffres et symboles.',
    );
  }
  return email;
}

interface ExistingProfile {
  id: string;
  email: string;
  role: string;
  status: string;
}

async function countAdmins(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ total: string }>(
    `select count(*)::text as total from public.profiles
      where role = 'admin' and status = 'approved'`,
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Cree ou promeut le compte principal.
 *
 * Le role fonctionnel « SUPER_ADMIN_PASTOR » correspond au role technique
 * `admin` (voir docs/ROLES_ET_PERMISSIONS.md) : c'est le seul role qui ouvre
 * l'ensemble du back-office.
 */
export async function initSuperAdmin(
  db: Database,
  options: BootstrapOptions,
): Promise<BootstrapResult> {
  const email = validateBootstrapInput(options);
  const firstName = (options.firstName ?? 'Pasteur').trim() || 'Pasteur';
  const lastName = (options.lastName ?? 'Principal').trim() || 'Principal';

  const { rows: profileRows } = await db.query<ExistingProfile>(
    `select id, email, role, status from public.profiles where lower(email) = $1 limit 1`,
    [email],
  );
  const existing = profileRows[0];

  // -------------------------------------------------------------------------
  // Cas 1 : le compte existe deja
  // -------------------------------------------------------------------------
  if (existing) {
    const dejaAdmin = existing.role === 'admin' && existing.status === 'approved';

    if (dejaAdmin && !options.resetPassword) {
      // Idempotent : on ne touche a rien, on ne cree pas de doublon.
      return { action: 'already_admin', profileId: existing.id, email };
    }

    if (!dejaAdmin && !options.promote) {
      throw new BootstrapError(
        `Un compte existe deja pour ${email} (role « ${existing.role} », statut « ${existing.status} »).`,
        'Relancez avec --promote pour elever ce compte au role d administrateur, sans creer de doublon.',
      );
    }

    const passwordHash = await hashPassword(options.password);
    await db.transaction(async (tx) => {
      await tx.query(
        `update auth.users set encrypted_password = $2, email_confirmed_at = now()
          where lower(email) = $1`,
        [email, passwordHash],
      );
      await tx.query(
        `update public.profiles
            set role = 'admin',
                status = 'approved',
                reviewed_at = now(),
                reviewed_by = null
          where id = $1`,
        [existing.id],
      );
      await tx.query(
        `insert into public.membership_history (profile_id, status, note)
         values ($1, 'approved', 'Initialisation du compte principal (promotion)')`,
        [existing.id],
      );
    });

    await recordAudit(db, {
      actorEmail: email,
      action: dejaAdmin ? 'admin.password_reset_bootstrap' : 'admin.promote',
      entityType: 'profile',
      entityId: existing.id,
      metadata: { previousRole: existing.role, previousStatus: existing.status },
    });

    return {
      action: dejaAdmin ? 'password_updated' : 'promoted',
      profileId: existing.id,
      email,
    };
  }

  // -------------------------------------------------------------------------
  // Cas 2 : aucun profil, mais un utilisateur d'authentification orphelin
  // -------------------------------------------------------------------------
  const { rows: authRows } = await db.query<{ id: string }>(
    'select id from auth.users where lower(email) = $1 limit 1',
    [email],
  );

  const admins = await countAdmins(db);
  if (admins > 0 && !options.allowAdditionalAdmin) {
    throw new BootstrapError(
      `Un administrateur actif existe deja (${admins}). L initialisation est terminee.`,
      'Utilisez --force pour ajouter volontairement un second administrateur, ou connectez-vous avec le compte existant.',
    );
  }

  const passwordHash = await hashPassword(options.password);
  const userId = authRows[0]?.id ?? randomUUID();

  const profileId = await db.transaction(async (tx) => {
    if (authRows[0]) {
      await tx.query(
        `update auth.users set encrypted_password = $2, email_confirmed_at = now() where id = $1`,
        [userId, passwordHash],
      );
    } else {
      // L'identifiant est genere ici : sur Supabase, `auth.users.id` n'a pas de
      // valeur par defaut, contrairement au schema local de developpement.
      await tx.query(
        `insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
         values ($1, $2, $3, now(), $4)`,
        [
          userId,
          email,
          passwordHash,
          JSON.stringify({ first_name: firstName, last_name: lastName }),
        ],
      );
    }

    await tx.query(
      `insert into public.profiles (id, email, first_name, last_name, status, role, reviewed_at)
       values ($1, $2, $3, $4, 'approved', 'admin', now())`,
      [userId, email, firstName, lastName],
    );
    await tx.query(
      `insert into public.membership_history (profile_id, status, note)
       values ($1, 'approved', 'Initialisation du compte principal')`,
      [userId],
    );
    return userId;
  });

  await recordAudit(db, {
    actorEmail: email,
    action: 'admin.bootstrap',
    entityType: 'profile',
    entityId: profileId,
  });

  return { action: 'created', profileId, email };
}

export interface SuperAdminState {
  exists: boolean;
  email: string | null;
  role: string | null;
  status: string | null;
  hasPassword: boolean;
  admins: number;
}

/** Etat du compte, sans jamais lire ni afficher le mot de passe. */
export async function inspectSuperAdmin(
  db: Queryable,
  email: string,
): Promise<SuperAdminState> {
  const normalized = normalizeEmail(email);
  const { rows } = await db.query<{
    email: string;
    role: string;
    status: string;
    encrypted_password: string | null;
  }>(
    `select p.email, p.role, p.status, u.encrypted_password
       from public.profiles p
       left join auth.users u on u.id = p.id
      where lower(p.email) = $1
      limit 1`,
    [normalized],
  );
  const row = rows[0];
  return {
    exists: Boolean(row),
    email: row?.email ?? null,
    role: row?.role ?? null,
    status: row?.status ?? null,
    hasPassword: Boolean(row?.encrypted_password),
    admins: await countAdmins(db),
  };
}
