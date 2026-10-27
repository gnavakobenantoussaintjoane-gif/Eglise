import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';
import { getDatabase } from '../../db/client.js';
import { AppError } from '../../utils/errors.js';
import type { ProfileRow } from '../profiles/mapper.js';
import type { RegisterInput } from './schemas.js';

export interface SupabaseSession {
  token: string;
  refreshToken: string | null;
  profile: ProfileRow;
  emailConfirmationRequired: boolean;
}

let anonClient: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw AppError.internal("Supabase Auth n'est pas configure.");
  }
  if (!anonClient) {
    anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return anonClient;
}

async function loadOrCreateProfile(userId: string, email: string, meta: Record<string, string>) {
  const db = getDatabase();
  const { rows } = await db.query<ProfileRow>(
    `insert into public.profiles (id, email, first_name, last_name)
     values ($1, $2, $3, $4)
     on conflict (id) do update set email = excluded.email
     returning *`,
    [userId, email, meta.first_name ?? '', meta.last_name ?? ''],
  );
  return rows[0];
}

/**
 * Delegue l'authentification a Supabase Auth (production).
 * Le backend conserve la main sur les profils, statuts et roles.
 */
export const supabaseProvider = {
  async register(input: RegisterInput): Promise<SupabaseSession> {
    const { data, error } = await client().auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { first_name: input.firstName, last_name: input.lastName },
      },
    });

    if (error) {
      if (error.status === 422 || /registered|exists/i.test(error.message)) {
        throw AppError.conflict('Un compte existe deja avec cette adresse e-mail.');
      }
      throw new AppError(400, 'AUTH_ERROR', error.message);
    }
    if (!data.user) throw AppError.internal('Reponse Supabase inattendue.');

    const db = getDatabase();
    const { rows: existing } = await db.query<{ id: string }>(
      'select id from public.profiles where id = $1',
      [data.user.id],
    );
    const profile = existing.length
      ? (
          await db.query<ProfileRow>('select * from public.profiles where id = $1', [
            data.user.id,
          ])
        ).rows[0]
      : await loadOrCreateProfile(data.user.id, data.user.email ?? input.email, {
          first_name: input.firstName,
          last_name: input.lastName,
        });

    if (input.phone || input.city) {
      await db.query(
        `update public.profiles set phone = coalesce($2, phone), city = coalesce($3, city)
         where id = $1`,
        [data.user.id, input.phone ?? null, input.city ?? null],
      );
    }

    return {
      token: data.session?.access_token ?? '',
      refreshToken: data.session?.refresh_token ?? null,
      profile,
      emailConfirmationRequired: !data.session,
    };
  },

  async login(email: string, password: string): Promise<SupabaseSession> {
    const { data, error } = await client().auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      if (/email not confirmed/i.test(error?.message ?? '')) {
        throw new AppError(
          403,
          'EMAIL_NOT_CONFIRMED',
          "Confirmez votre adresse e-mail avant de vous connecter.",
        );
      }
      throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect.');
    }

    const profile = await loadOrCreateProfile(
      data.user.id,
      data.user.email ?? email,
      (data.user.user_metadata ?? {}) as Record<string, string>,
    );

    await getDatabase().query(
      'update public.profiles set last_login_at = now() where id = $1',
      [data.user.id],
    );

    return {
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      profile,
      emailConfirmationRequired: false,
    };
  },

  async refresh(refreshToken: string) {
    const { data, error } = await client().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      throw AppError.unauthorized('Session expiree, reconnectez-vous.');
    }
    return { token: data.session.access_token, refreshToken: data.session.refresh_token };
  },

  async logout(token: string) {
    try {
      await client().auth.admin.signOut(token, 'global');
    } catch {
      // Deconnexion best-effort : le cookie est efface dans tous les cas.
    }
  },

  async sendPasswordReset(email: string, redirectTo: string) {
    await client().auth.resetPasswordForEmail(email, { redirectTo });
  },
};
