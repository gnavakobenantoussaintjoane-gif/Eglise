import { createApp } from './app.js';
import { env, isProduction } from './config/env.js';
import { getDatabase, closeDatabase } from './db/client.js';
import { runMigrations } from './db/migrate.js';

async function main(): Promise<void> {
  const db = getDatabase();
  const shouldMigrate =
    env.AUTO_MIGRATE && (db.driver === 'pglite' || !isProduction);

  if (shouldMigrate) {
    try {
      await runMigrations();
    } catch (error) {
      console.error('[startup] migration impossible', error);
      if (db.driver === 'pglite') process.exit(1);
    }
  }

  const app = createApp();
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(
      `[api] La Forteresse de l'Eternel — ${env.NODE_ENV} sur http://localhost:${env.PORT}${env.API_PREFIX}`,
    );
    console.log(`[api] base de donnees : ${db.driver} — stockage : ${env.STORAGE_DRIVER}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[api] signal ${signal}, arret en cours...`);
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[api] demarrage impossible', error);
  process.exit(1);
});
