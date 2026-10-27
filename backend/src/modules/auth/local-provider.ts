import { getDatabase } from '../../db/client.js';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { signSessionToken } from '../../auth/tokens.js';
import { AppError } from '../../utils/errors.js';
import { recordAudit } from '../../middlewares/audit.js';
import type { ProfileRow } from '../profiles/mapper.js';
import type { RegisterInput } from './schemas.js';

export interface LocalSession {
  token: string;
  profile: ProfileRow;
}

/**
 * Authentification locale (developpement, tests, deploiement sans Supabase Auth).
 * En production, Supabase Auth est recommande : voir docs/SECURITY.md.
 */
export const localProvider = {
  async register(input: RegisterInput): Promise<LocalSession> {
    const db = getDatabase();
    const { rows: existing } = await db.query<{ id: string }>(
      'select id from auth.users where lower(email) = lower($1) limit 1',
      [input.email],
    );
    if (existing.length > 0) {
      throw AppError.conflict('Un compte existe deja avec cette adresse e-mail.');
    }

    const passwordHash = await hashPassword(input.password);
    const profile = await db.transaction(async (tx) => {
      const { rows: users } = await tx.query<{ id: string }>(
        `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
         values ($1, $2, now(), $3)
         returning id`,
        [
          input.email,
          passwordHash,
          JSON.stringify({ first_name: input.firstName, last_name: input.lastName }),
        ],
      );
      const userId = users[0].id;
      const { rows: profiles } = await tx.query<ProfileRow>(
        `insert into public.profiles (id, email, first_name, last_name, phone, city, status)
         values ($1, $2, $3, $4, $5, $6, 'profile_incomplete')
         returning *`,
        [userId, input.email, input.firstName, input.lastName, input.phone ?? null, input.city ?? null],
      );
      await tx.query(
        `insert into public.membership_history (profile_id, status, note)
         values ($1, 'profile_incomplete', 'Creation du compte')`,
        [userId],
      );
      return profiles[0];
    });

    const token = await signSessionToken({
      sub: profile.id,
      email: profile.email,
      role: profile.role,
      provider: 'local',
    });

    await recordAudit(db, {
      actorId: profile.id,
      actorEmail: profile.email,
      action: 'auth.register',
      entityType: 'profile',
      entityId: profile.id,
    });

    return { token, profile };
  },

  async login(email: string, password: string): Promise<LocalSession> {
    const db = getDatabase();
    const { rows } = await db.query<{ id: string; encrypted_password: string | null }>(
      'select id, encrypted_password from auth.users where lower(email) = lower($1) limit 1',
      [email],
    );
    const user = rows[0];
    const valid = user?.encrypted_password
      ? await verifyPassword(password, user.encrypted_password)
      : false;

    if (!user || !valid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect.');
    }

    let { rows: profiles } = await db.query<ProfileRow>(
      'select * from public.profiles where id = $1',
      [user.id],
    );
    if (!profiles[0]) {
      const created = await db.query<ProfileRow>(
        `insert into public.profiles (id, email) values ($1, $2) returning *`,
        [user.id, email],
      );
      profiles = created.rows;
    }

    await db.query('update public.profiles set last_login_at = now() where id = $1', [user.id]);

    const profile = profiles[0];
    const token = await signSessionToken({
      sub: profile.id,
      email: profile.email,
      role: profile.role,
      provider: 'local',
    });

    await recordAudit(db, {
      actorId: profile.id,
      actorEmail: profile.email,
      action: 'auth.login',
      entityType: 'profile',
      entityId: profile.id,
    });

    return { token, profile };
  },

  async changePassword(profileId: string, currentPassword: string, newPassword: string) {
    const db = getDatabase();
    const { rows } = await db.query<{ encrypted_password: string | null }>(
      'select encrypted_password from auth.users where id = $1',
      [profileId],
    );
    const stored = rows[0]?.encrypted_password;
    if (!stored || !(await verifyPassword(currentPassword, stored))) {
      throw new AppError(400, 'INVALID_PASSWORD', 'Mot de passe actuel incorrect.');
    }
    const hash = await hashPassword(newPassword);
    await db.query('update auth.users set encrypted_password = $2, updated_at = now() where id = $1', [
      profileId,
      hash,
    ]);
    await db.query('update auth.refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [profileId]);
  },
};
