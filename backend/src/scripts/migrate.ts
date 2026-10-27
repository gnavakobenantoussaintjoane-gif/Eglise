import { closeDatabase, getDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';

async function main() {
  const db = getDatabase();
  console.log(`[migrate] base : ${db.driver}`);
  const applied = await runMigrations();
  console.log(
    applied.length > 0
      ? `[migrate] ${applied.length} migration(s) appliquee(s).`
      : '[migrate] aucune migration a appliquer.',
  );
  await closeDatabase();
}

main().catch(async (error) => {
  console.error('[migrate] echec', error);
  await closeDatabase().catch(() => undefined);
  process.exit(1);
});
