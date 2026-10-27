import { isProduction } from '../config/env.js';
import { closeDatabase, getDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';

/**
 * Reinitialisation destructive — developpement uniquement.
 * Refusee en production et sur une base PostgreSQL distante (Supabase).
 */
async function main() {
  if (isProduction) {
    console.error('[reset] refuse en production.');
    process.exit(1);
  }
  const db = getDatabase();
  if (db.driver !== 'pglite') {
    console.error(
      '[reset] cette commande ne fonctionne que sur la base locale PGlite.\n' +
        'Pour un projet Supabase, utilisez les migrations et la console SQL.',
    );
    process.exit(1);
  }

  console.log('[reset] suppression des schemas public et auth...');
  await db.query('drop schema if exists public cascade');
  await db.query('create schema public');
  await db.query('drop schema if exists auth cascade');

  await runMigrations();
  console.log('[reset] base locale reinitialisee. Lancez `npm run db:seed`.');
  await closeDatabase();
}

main().catch(async (error) => {
  console.error('[reset] echec', error);
  await closeDatabase().catch(() => undefined);
  process.exit(1);
});
