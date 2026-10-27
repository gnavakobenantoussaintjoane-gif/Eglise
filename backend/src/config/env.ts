import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
export const backendRoot = path.resolve(here, '../..');
export const repoRoot = path.resolve(backendRoot, '..');

// Charge backend/.env puis la racine (le premier fichier trouve gagne).
for (const envPath of [
  path.join(backendRoot, '.env'),
  path.join(repoRoot, '.env'),
]) {
  if (existsSync(envPath)) dotenv.config({ path: envPath });
}

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_PREFIX: z.string().default('/api/v1'),

    FRONTEND_URL: z.string().default('http://localhost:5173'),
    CORS_ORIGINS: z.string().default(''),
    PUBLIC_API_URL: z.string().default(''),

    DATABASE_URL: optionalString,
    PGLITE_DATA_DIR: z.string().default(path.join(backendRoot, 'var', 'pglite')),
    AUTO_MIGRATE: booleanish.default(true),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),

    STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default(path.join(backendRoot, 'var', 'uploads')),
    SUPABASE_URL: optionalString,
    SUPABASE_ANON_KEY: optionalString,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    SUPABASE_JWT_SECRET: optionalString,
    SUPABASE_STORAGE_BUCKET: z.string().default('media'),
    SUPABASE_PUBLIC_BUCKET: z.string().default('public-assets'),

    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET doit contenir au moins 32 caracteres'),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
    COOKIE_NAME: z.string().default('lfe_session'),
    COOKIE_SECURE: booleanish.optional(),

    ADMIN_BOOTSTRAP_EMAIL: optionalString,
    ADMIN_BOOTSTRAP_PASSWORD: optionalString,
    ADMIN_BOOTSTRAP_FIRST_NAME: z.string().default('Administrateur'),
    ADMIN_BOOTSTRAP_LAST_NAME: z.string().default('Principal'),

    SEED_DEMO_DATA: booleanish.default(false),
    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((value, ctx) => {
    if (!value.DATABASE_URL && value.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'DATABASE_URL est obligatoire en production. Le stockage PGlite local est reserve au developpement.',
        path: ['DATABASE_URL'],
      });
    }
    if (value.STORAGE_DRIVER === 'supabase') {
      for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${key} est obligatoire lorsque STORAGE_DRIVER=supabase`,
            path: [key],
          });
        }
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

function loadEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration invalide. Corrigez backend/.env :\n${details}`);
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const corsOrigins = [
  env.FRONTEND_URL,
  ...env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
]
  .filter(Boolean)
  .filter((origin, index, list) => list.indexOf(origin) === index);

/**
 * Base des liens de fichiers signes.
 * Vide = URL relative (`/api/v1/files/...`), resolue par le navigateur sur
 * l'origine du frontend puis proxifiee vers l'API : fonctionne en local, en
 * preview et derriere un reverse proxy, sans dependre d'un hostname.
 */
export const publicApiUrl = env.PUBLIC_API_URL || env.API_PREFIX;

export const cookieSecure = env.COOKIE_SECURE ?? isProduction;

/** Lit un secret optionnel, en refusant une valeur d'exemple en production. */
export function assertSecret(name: string, value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (isProduction && /change[-_]?me|example|placeholder/i.test(value)) {
    throw new Error(`${name} utilise encore une valeur d'exemple : a remplacer avant la production.`);
  }
  return value;
}

export function readSecretFile(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  return readFileSync(filePath, 'utf8').trim();
}
