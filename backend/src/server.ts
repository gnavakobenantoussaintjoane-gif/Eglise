import { createApp } from './app.js';
import { env, isProduction } from './config/env.js';
import { getDatabase, closeDatabase } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { closeMailTransport, startMailWorker, stopMailWorker } from './services/email/index.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  const db = getDatabase();
  const shouldMigrate =
    env.AUTO_MIGRATE && (db.driver === 'pglite' || !isProduction);

  if (shouldMigrate) {
    try {
      await runMigrations();
    } catch (error) {
      logger.error('[startup] migration impossible', error);
      if (db.driver === 'pglite') process.exit(1);
    }
  }

  const app = createApp();
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(
      `[api] La Forteresse de l'Eternel — ${env.NODE_ENV} sur http://localhost:${env.PORT}${env.API_PREFIX}`,
    );
    logger.info(`[api] base de donnees : ${db.driver} — stockage : ${env.STORAGE_DRIVER}`);
  });

  // Expedition des e-mails en attente (sans effet si MAIL_DRIVER=off ou en test).
  startMailWorker();

  const shutdown = async (signal: string) => {
    logger.info(`[api] signal ${signal}, arret en cours...`);
    stopMailWorker();
    server.close(async () => {
      await closeMailTransport();
      await closeDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error('[api] demarrage impossible', error);
  process.exit(1);
});
