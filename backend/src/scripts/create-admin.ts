import { env, isProduction } from '../config/env.js';
import { closeDatabase, getDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { passwordIssues } from '../auth/password.js';
import { BootstrapError, initSuperAdmin, normalizeEmail } from '../auth/bootstrap.js';
import { askHidden, requireInteractive } from '../utils/prompt.js';

/**
 * Creation (ou promotion) d'un administrateur.
 *
 * Historique : ce script acceptait le mot de passe en second argument. Cela le
 * rendait visible dans l'historique du shell et la liste des processus. Le mot
 * de passe est desormais demande a l'invite, avec echo masque.
 *
 * Pour le compte principal de l'eglise, preferez `npm run init-super-admin`,
 * qui applique les garde-fous d'initialisation (pas de second administrateur
 * implicite, pas de doublon).
 */
async function main() {
  const db = getDatabase();
  await runMigrations({ silent: true });

  const email = normalizeEmail(process.argv[2] ?? env.ADMIN_BOOTSTRAP_EMAIL ?? '');
  if (!email) {
    console.error(
      [
        'Usage : npm run create-admin -- <email>',
        '   ou : renseignez ADMIN_BOOTSTRAP_EMAIL dans backend/.env',
        '',
        'Le mot de passe vous sera demande de facon masquee.',
        'Pour le compte principal, utilisez plutot : npm run init-super-admin -- --email <adresse>',
      ].join('\n'),
    );
    process.exit(1);
  }

  if (process.argv[3]) {
    console.error(
      [
        'Le mot de passe ne doit pas etre passe en argument (il resterait dans',
        "l'historique du shell et dans la liste des processus).",
        'Relancez la commande sans mot de passe : il vous sera demande de facon masquee.',
      ].join('\n'),
    );
    process.exit(2);
  }

  requireInteractive('create-admin');

  // Compatibilite : la variable ADMIN_BOOTSTRAP_PASSWORD reste acceptee pour les
  // environnements automatises, mais elle est signalee comme un risque.
  let password = env.ADMIN_BOOTSTRAP_PASSWORD ?? '';
  if (password) {
    console.warn(
      '[create-admin] ADMIN_BOOTSTRAP_PASSWORD est defini dans l environnement : preferez la saisie masquee et supprimez cette variable.',
    );
  } else {
    password = await askHidden('Mot de passe : ');
    const confirmation = await askHidden('Confirmez le mot de passe : ');
    if (password !== confirmation) {
      console.error('[create-admin] les deux saisies ne correspondent pas.');
      process.exit(1);
    }
  }

  const issues = passwordIssues(password);
  if (issues.length > 0) {
    console.error(`[create-admin] mot de passe trop faible : il manque ${issues.join(', ')}.`);
    process.exit(1);
  }

  try {
    const result = await initSuperAdmin(db, {
      email,
      password,
      firstName: env.ADMIN_BOOTSTRAP_FIRST_NAME,
      lastName: env.ADMIN_BOOTSTRAP_LAST_NAME,
      promote: true,
      // `create-admin` reste l'outil d'ajout d'administrateur explicite.
      allowAdditionalAdmin: true,
    });
    const labels = {
      created: 'administrateur cree',
      promoted: 'compte existant promu administrateur',
      password_updated: 'mot de passe mis a jour',
      already_admin: 'compte deja administrateur',
    } as const;
    console.log(`[create-admin] ${labels[result.action]} : ${result.email}`);
  } catch (error) {
    if (error instanceof BootstrapError) {
      console.error(`[create-admin] ${error.message}`);
      if (error.hint) console.error(`[create-admin] ${error.hint}`);
    } else {
      throw error;
    }
  }

  if (isProduction) {
    console.log(
      '[create-admin] Pensez a supprimer ADMIN_BOOTSTRAP_PASSWORD de votre environnement.',
    );
  }
  await closeDatabase();
}

main().catch(async (error) => {
  console.error('[create-admin] echec', error);
  await closeDatabase().catch(() => undefined);
  process.exit(1);
});
