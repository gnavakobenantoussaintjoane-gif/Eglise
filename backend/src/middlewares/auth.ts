import type { Request, RequestHandler } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { getDatabase } from '../db/client.js';
import { verifySessionToken } from '../auth/tokens.js';
import { AppError } from '../utils/errors.js';
import type { AppRole } from '../config/constants.js';
import { mapProfileRow, type ProfileRow } from '../modules/profiles/mapper.js';
import { isApproved, type AuthContext, type AuthProfile } from '../auth/permissions.js';

/** Vrai si l'authentification deleguee a Supabase Auth est configuree. */
export function supabaseAuthEnabled(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

let adminClient: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!adminClient) {
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim() || null;
  }
  const cookie = req.cookies?.[env.COOKIE_NAME];
  return typeof cookie === 'string' && cookie.length > 0 ? cookie : null;
}

export async function findProfileById(id: string): Promise<AuthProfile | null> {
  const db = getDatabase();
  const { rows } = await db.query<ProfileRow>('select * from public.profiles where id = $1', [id]);
  const row = rows[0];
  return row ? mapProfileRow(row) : null;
}

async function contextFromSupabaseToken(token: string, req: Request): Promise<AuthContext | null> {
  const admin = supabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  let profile = await findProfileById(data.user.id);
  if (!profile) {
    // Profil pas encore cree (inscription via Supabase) : on l'amorce.
    const db = getDatabase();
    const email = data.user.email ?? '';
    const meta = (data.user.user_metadata ?? {}) as Record<string, string>;
    const { rows } = await db.query<ProfileRow>(
      `insert into public.profiles (id, email, first_name, last_name)
       values ($1, $2, $3, $4)
       on conflict (id) do update set email = excluded.email
       returning *`,
      [data.user.id, email, meta.first_name ?? '', meta.last_name ?? ''],
    );
    profile = rows[0] ? mapProfileRow(rows[0]) : null;
  }

  if (!profile) return null;
  req.auth = { profile, provider: 'supabase', token };
  return req.auth;
}

/** Attache `req.auth` si un jeton valide est present, sans jamais rejeter. */
export const loadAuthContext: RequestHandler = (req, _res, next) => {
  req.auth = null;
  const token = readToken(req);
  if (!token) return next();

  (async () => {
    if (supabaseAuthEnabled()) {
      const ctx = await contextFromSupabaseToken(token, req);
      if (ctx) return ctx;
    }
    const claims = await verifySessionToken(token);
    if (!claims) return null;
    const profile = await findProfileById(claims.sub);
    if (!profile) return null;
    req.auth = { profile, provider: 'local', token };
    return req.auth;
  })()
    .then(() => next())
    .catch(next);
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(AppError.unauthorized());
  next();
};

export const requireApproved: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(AppError.unauthorized());
  if (!isApproved(req.auth.profile)) {
    return next(
      AppError.forbidden(
        "Cette espace est reserve aux membres dont l'inscription a ete approuvee.",
      ),
    );
  }
  next();
};

export function requireRole(...roles: AppRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(AppError.unauthorized());
    const { profile } = req.auth;
    if (!isApproved(profile) || !roles.includes(profile.role)) {
      return next(AppError.forbidden("Votre role ne permet pas cette action."));
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');
export const requireMedia = requireRole('media', 'admin');

export function authContext(req: Request): AuthContext {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}

export function currentProfile(req: Request): AuthProfile {
  return authContext(req).profile;
}
