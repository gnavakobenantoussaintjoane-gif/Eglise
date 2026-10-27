import type { Response } from 'express';
import { getDatabase } from '../../db/client.js';
import { env, cookieSecure, isProduction, isTest } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { createRandomToken, hashToken, signSessionToken } from '../../auth/tokens.js';
import { findProfileById, supabaseAuthEnabled } from '../../middlewares/auth.js';
import { notifyAdmins } from '../../services/notifications.js';
import { recordAudit } from '../../middlewares/audit.js';
import { mapProfileRow, type ProfileRow } from '../profiles/mapper.js';
import type { AuthProfile } from '../../auth/permissions.js';
import { hashPassword } from '../../auth/password.js';
import { localProvider } from './local-provider.js';
import { supabaseProvider } from './supabase-provider.js';
import type { LoginInput, ProfileUpdateInput, RegisterInput } from './schemas.js';

const REFRESH_COOKIE = `${env.COOKIE_NAME}_refresh`;

export function setSessionCookies(res: Response, token: string, refreshToken?: string | null): void {
  const maxAge = env.SESSION_TTL_HOURS * 60 * 60 * 1000;
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(env.COOKIE_NAME, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
}

export function readRefreshToken(cookies: Record<string, string> | undefined): string | null {
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export interface AuthResult {
  token: string;
  refreshToken?: string | null;
  profile: AuthProfile;
  emailConfirmationRequired?: boolean;
}

export const authService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    if (supabaseAuthEnabled()) {
      const session = await supabaseProvider.register(input);
      const profile = await findProfileById(session.profile.id);
      if (!profile) throw AppError.internal('Profil non cree.');
      return {
        token: session.token,
        refreshToken: session.refreshToken,
        profile,
        emailConfirmationRequired: session.emailConfirmationRequired,
      };
    }

    const { token, profile } = await localProvider.register(input);
    return { token, profile: mapProfileRow(profile) };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    if (supabaseAuthEnabled()) {
      const session = await supabaseProvider.login(input.email, input.password);
      const profile = await findProfileById(session.profile.id);
      if (!profile) throw AppError.internal('Profil introuvable.');
      return { token: session.token, refreshToken: session.refreshToken, profile };
    }
    const { token, profile } = await localProvider.login(input.email, input.password);
    return { token, profile: mapProfileRow(profile) };
  },

  async refresh(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    if (!supabaseAuthEnabled()) {
      throw AppError.unauthorized('Session expiree, reconnectez-vous.');
    }
    return supabaseProvider.refresh(refreshToken);
  },

  async logout(token: string | null): Promise<void> {
    if (supabaseAuthEnabled() && token) {
      await supabaseProvider.logout(token);
    }
  },

  async updateProfile(profile: AuthProfile, input: ProfileUpdateInput): Promise<AuthProfile> {
    const db = getDatabase();
    const { rows } = await db.query<ProfileRow>(
      `update public.profiles set
         first_name = coalesce($2, first_name),
         last_name = coalesce($3, last_name),
         phone = case when $4::boolean then $5 else phone end,
         city = case when $6::boolean then $7 else city end,
         profession = case when $8::boolean then $9 else profession end,
         bio = case when $10::boolean then $11 else bio end,
         department_interest_id = case when $12::boolean then $13::uuid else department_interest_id end,
         consent_photos = coalesce($14, consent_photos)
       where id = $1
       returning *`,
      [
        profile.id,
        input.firstName ?? null,
        input.lastName ?? null,
        input.phone !== undefined,
        input.phone ?? null,
        input.city !== undefined,
        input.city ?? null,
        input.profession !== undefined,
        input.profession ?? null,
        input.bio !== undefined,
        input.bio ?? null,
        input.departmentInterestId !== undefined,
        input.departmentInterestId ?? null,
        input.consentPhotos ?? null,
      ],
    );

    if (!rows[0]) throw AppError.notFound('Profil introuvable.');

    await recordAudit(db, {
      actorId: profile.id,
      actorEmail: profile.email,
      action: 'profile.update',
      entityType: 'profile',
      entityId: profile.id,
      metadata: { fields: Object.keys(input) },
    });

    return mapProfileRow(rows[0]);
  },

  /** Conditions minimales pour soumettre une demande d'adhesion. */
  missingProfileFields(profile: AuthProfile): string[] {
    const missing: string[] = [];
    if (!profile.firstName?.trim()) missing.push('Prenom');
    if (!profile.lastName?.trim()) missing.push('Nom');
    if (!profile.city?.trim()) missing.push('Ville ou commune');
    if (!profile.phone?.trim()) missing.push('Telephone');
    return missing;
  },

  async submitMembership(profile: AuthProfile): Promise<AuthProfile> {
    if (profile.status === 'approved') {
      throw AppError.conflict('Votre inscription est deja approuvee.');
    }
    if (profile.status === 'suspended') {
      throw AppError.forbidden('Votre compte est suspendu : contactez un administrateur.');
    }
    if (profile.status === 'pending_review') {
      throw AppError.conflict("Votre demande est deja en cours d'examen.");
    }
    const missing = this.missingProfileFields(profile);
    if (missing.length > 0) {
      throw AppError.badRequest(`Completez votre profil : ${missing.join(', ')}.`);
    }

    const db = getDatabase();
    const { rows } = await db.query<ProfileRow>(
      `update public.profiles
       set status = 'pending_review', submitted_at = now(), decision_note = null
       where id = $1 and status in ('profile_incomplete', 'rejected')
       returning *`,
      [profile.id],
    );
    const updated = rows[0];
    if (!updated) {
      throw AppError.conflict("Votre demande ne peut pas etre soumise dans cet etat.");
    }

    await db.query(
      `insert into public.membership_history (profile_id, status, note, actor_id)
       values ($1, 'pending_review', 'Demande soumise par le membre', $1)`,
      [profile.id],
    );
    await notifyAdmins(db, {
      type: 'membership.submitted',
      title: "Nouvelle demande d'adhesion",
      body: `${updated.first_name ?? ''} ${updated.last_name ?? ''} attend une validation.`.trim(),
      link: '/admin/membres',
    });
    await recordAudit(db, {
      actorId: profile.id,
      actorEmail: profile.email,
      action: 'membership.submit',
      entityType: 'profile',
      entityId: profile.id,
    });

    return mapProfileRow(updated);
  },

  async requestPasswordReset(email: string): Promise<{ devResetUrl?: string }> {
    const db = getDatabase();

    if (supabaseAuthEnabled()) {
      await supabaseProvider.sendPasswordReset(
        email,
        `${env.FRONTEND_URL}/reinitialiser-mot-de-passe`,
      );
      return {};
    }

    const { rows } = await db.query<{ id: string }>(
      'select id from public.profiles where lower(email) = lower($1) limit 1',
      [email],
    );
    const profile = rows[0];
    // Reponse identique que le compte existe ou non (pas d'enumeration).
    if (!profile) return {};

    const token = createRandomToken();
    await db.query(
      `insert into public.password_reset_tokens (profile_id, token_hash, expires_at)
       values ($1, $2, now() + interval '1 hour')`,
      [profile.id, hashToken(token)],
    );
    await recordAudit(db, {
      actorId: profile.id,
      actorEmail: email,
      action: 'auth.password_reset_requested',
      entityType: 'profile',
      entityId: profile.id,
    });

    const resetUrl = `${env.FRONTEND_URL}/reinitialiser-mot-de-passe?token=${token}`;
    // Sans fournisseur d'e-mail configure, le lien n'est expose qu'en dev/test.
    return isProduction && !isTest ? {} : { devResetUrl: resetUrl };
  },

  async resetPassword(token: string, password: string): Promise<void> {
    if (supabaseAuthEnabled()) {
      throw new AppError(
        400,
        'USE_SUPABASE_LINK',
        'Utilisez le lien de reinitialisation envoye par Supabase Auth.',
      );
    }

    const db = getDatabase();
    const { rows } = await db.query<{ id: string; profile_id: string }>(
      `select id, profile_id from public.password_reset_tokens
       where token_hash = $1 and used_at is null and expires_at > now()
       limit 1`,
      [hashToken(token)],
    );
    const record = rows[0];
    if (!record) {
      throw AppError.badRequest('Lien de reinitialisation invalide ou expire.');
    }

    const hash = await hashPassword(password);
    await db.query(
      'update auth.users set encrypted_password = $2, updated_at = now() where id = $1',
      [record.profile_id, hash],
    );
    await db.query('update public.password_reset_tokens set used_at = now() where id = $1', [
      record.id,
    ]);
    await db.query(
      'update public.password_reset_tokens set used_at = now() where profile_id = $1 and used_at is null',
      [record.profile_id],
    );
    await recordAudit(db, {
      action: 'auth.password_reset_completed',
      entityType: 'profile',
      entityId: record.profile_id,
    });
  },

  async changePassword(profile: AuthProfile, currentPassword: string, newPassword: string) {
    if (supabaseAuthEnabled()) {
      throw new AppError(
        400,
        'USE_SUPABASE',
        'La modification du mot de passe se fait via Supabase Auth.',
      );
    }
    await localProvider.changePassword(profile.id, currentPassword, newPassword);
  },

  async signSessionFor(profile: AuthProfile): Promise<string> {
    return signSessionToken({
      sub: profile.id,
      email: profile.email,
      role: profile.role,
      provider: supabaseAuthEnabled() ? 'supabase' : 'local',
    });
  },
};
