import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from '../db/client.js';
import { repoRoot } from '../config/env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../../supabase/migrations');
const localStubPath = path.resolve(repoRoot, 'supabase/local/01_auth_stub.sql');

export async function ensureMigrationsTable(): Promise<void> {
  const db = getDatabase();
  await db.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

export interface MigrateOptions {
  /** Force l'execution sur une base non locale (Supabase). */
  includeLocalStub?: boolean;
  silent?: boolean;
}

export async function runMigrations(options: MigrateOptions = {}): Promise<string[]> {
  const db = getDatabase();
  await ensureMigrationsTable();
  const applied: string[] = [];

  if (db.driver === 'pglite' && options.includeLocalStub !== false) {
    const stub = await readFile(localStubPath, 'utf8');
    await db.exec(stub);
  }

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const { rows } = await db.query<{ version: string }>(
    'select version from public.schema_migrations',
  );
  const done = new Set(rows.map((row) => row.version));

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    try {
      await db.transaction(async (tx) => {
        await tx.exec(sql);
        await tx.query('insert into public.schema_migrations (version) values ($1)', [file]);
      });
      applied.push(file);
      if (!options.silent) console.log(`[migrations] applique : ${file}`);
    } catch (error) {
      console.error(`[migrations] echec sur ${file}`, error);
      throw error;
    }
  }

  if (!options.silent && applied.length === 0) {
    console.log('[migrations] base deja a jour.');
  }

  return applied;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
