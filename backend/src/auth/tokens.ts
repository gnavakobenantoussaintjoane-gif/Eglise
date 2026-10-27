import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env, publicApiUrl, repoRoot } from '../config/env.js';
import { isProduction } from '../config/env.js';

const secretKey = new TextEncoder().encode(env.SESSION_SECRET);

export interface SessionClaims extends JWTPayload {
  sub: string;
  email: string;
  role: string;
  provider: 'local' | 'supabase';
  ver?: number;
}

export async function signSessionToken(claims: {
  sub: string;
  email: string;
  role: string;
  provider: 'local' | 'supabase';
}): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer('la-forteresse-de-leternel')
    .setAudience('lfe-app')
    .setSubject(claims.sub)
    .setExpirationTime(`${env.SESSION_TTL_HOURS}h`)
    .sign(secretKey);
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: 'la-forteresse-de-leternel',
      audience: 'lfe-app',
    });
    if (!payload.sub) return null;
    return payload as SessionClaims;
  } catch {
    return null;
  }
}

/** Jeton court pour un lien de reinitialisation envoye par un fournisseur d'e-mail. */
export function createRandomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Signature d'une URL de fichier privee (equivalent d'une URL signee Supabase)
 * valable `ttlSeconds`. Le chemin et l'expiration sont dans le message signe.
 */
export function signFileUrl(storagePath: string, ttlSeconds = 900): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${storagePath}|${expires}`;
  const signature = createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
  const token = Buffer.from(payload, 'utf8').toString('base64url');
  const base = publicApiUrl.endsWith('/') ? publicApiUrl.slice(0, -1) : publicApiUrl;
  return `${base}/files/${token}.${signature}`;
}

export function verifyFileSignature(
  token: string,
  signature: string,
): { valid: boolean; storagePath?: string; expired?: boolean } {
  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return { valid: false };
  }
  const [storagePath, expiresRaw] = decoded.split('|');
  if (!storagePath || !expiresRaw) return { valid: false };
  const expected = createHmac('sha256', env.SESSION_SECRET)
    .update(decoded)
    .digest('base64url');
  if (!safeEqual(signature, expected)) return { valid: false };
  const expired = Number(expiresRaw) * 1000 < Date.now();
  return { valid: true, storagePath, expired };
}

/** Chemin de stockage a partir d'une URL d'API (pour les controles d'acces). */
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'http://local.invalid');
    const match = parsed.pathname.match(/\/files\/([^/]+)\.([^/]+)$/);
    if (!match) return null;
    const decoded = Buffer.from(match[1], 'base64url').toString('utf8');
    return decoded.split('|')[0] ?? null;
  } catch {
    return null;
  }
}

export const authIssuer = 'la-forteresse-de-leternel';
export const repoRootForAuth = repoRoot;
export const productionMode = isProduction;
