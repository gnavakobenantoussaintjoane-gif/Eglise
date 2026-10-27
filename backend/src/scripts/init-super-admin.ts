import { closeDatabase, getDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { env } from '../config/env.js';
import {
  BootstrapError,
  initSuperAdmin,
  inspectSuperAdmin,
  normalizeEmail,
} from '../auth/bootstrap.js';
import { askHidden, askText, requireInteractive } from '../utils/prompt.js';

/**
 * Initialisation du compte principal (pasteur / super administrateur).
 *
 * Usage :
 *   npm run init-super-admin -- --email joannegnava@gmail.com
 *   npm run init-super-admin -- --email ... --promote          (compte existant)
 *   npm run init-super-admin -- --email ... --reset-password    (mot de passe perdu)
 *   npm run init-super-admin -- --email ... --force             (2e administrateur)
 *   npm run init-super-admin -- --verify                        (etat du compte)
 *
 * Le mot de passe est TOUJOURS saisi a l'invite, avec echo masque :
 * il n'est jamais accepte en argument, dans l'environnement, ni dans un fichier.
 */

interface CliOptions {
  email: string;
  promote: boolean;
  resetPassword: boolean;
  force: boolean;
  verify: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    email: '',
    promote: false,
    resetPassword: false,
    force: false,
    verify: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--email':
        options.email = argv[index + 1] ?? '';
        index += 1;
        break;
      case '--promote':
        options.promote = true;
        break;
      case '--reset-password':
        options.resetPassword = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--verify':
        options.verify = true;
        break;
      default:
        // Un argument inattendu (notamment un mot de passe) est refuse : cela
        // eviterait qu'il se retrouve dans l'historique du shell.
        if (arg.startsWith('--')) {
          console.error(`Option inconnue : ${arg}`);
          process.exit(2);
        }
        console.error(
          [
            `Argument inattendu : « ${arg} ».`,
            'Le mot de passe ne doit jamais etre passe en argument : il vous sera demande de facon masquee.',
          ].join('\n'),
        );
        process.exit(2);
    }
  }

  return options;
}

function showUsage(): void {
  console.log(
    [
      'Initialisation du compte principal (pasteur / super administrateur).',
      '',
      '  npm run init-super-admin -- --email <adresse>',
      '',
      'Options :',
      '  --promote         elever un compte existant (sans creer de doublon)',
      '  --reset-password  definir un nouveau mot de passe sur un compte existant',
      '  --force           créer un administrateur supplementaire',
      '  --verify          afficher l etat du compte sans rien modifier',
      '',
      'Le mot de passe est saisi a l invite, avec echo masque.',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const db = getDatabase();

  if (!options.email) {
    showUsage();
    throw new BootstrapError('Adresse e-mail obligatoire (--email).');
  }
  const email = normalizeEmail(options.email);

  await runMigrations({ silent: true });

  if (options.verify) {
    const state = await inspectSuperAdmin(db, email);
    console.log('[init-super-admin] etat du compte');
    console.log(`  e-mail              : ${email}`);
    console.log(`  compte existant     : ${state.exists ? 'oui' : 'non'}`);
    if (state.exists) {
      console.log(`  role                : ${state.role}`);
      console.log(`  statut              : ${state.status}`);
      console.log(`  mot de passe defini : ${state.hasPassword ? 'oui' : 'non'}`);
    }
    console.log(`  administrateurs     : ${state.admins}`);
    await closeDatabase();
    return;
  }

  requireInteractive('init-super-admin');

  const state = await inspectSuperAdmin(db, email);
  console.log(`[init-super-admin] base : ${db.driver}`);
  if (db.driver === 'pg') {
    console.log('[init-super-admin] cible : base distante (Supabase ou PostgreSQL gere).');
  }
  if (state.exists) {
    console.log(
      `[init-super-admin] un compte existe deja (role « ${state.role} », statut « ${state.status} »).`,
    );
  }
  console.log(
    '[init-super-admin] votre mot de passe ne sera ni affiche, ni enregistre en clair, ni journalise.',
  );

  const password = await askHidden('Mot de passe : ');
  const confirmation = await askHidden('Confirmez le mot de passe : ');
  if (password !== confirmation) {
    throw new BootstrapError('Les deux saisies ne correspondent pas. Aucune modification effectuee.');
  }

  const firstName = (await askText(`Prenom [${env.ADMIN_BOOTSTRAP_FIRST_NAME || 'Pasteur'}] : `)).trim();
  const lastName = (await askText(`Nom [${env.ADMIN_BOOTSTRAP_LAST_NAME || 'Principal'}] : `)).trim();

  const result = await initSuperAdmin(db, {
    email,
    password,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    promote: options.promote,
    resetPassword: options.resetPassword,
    allowAdditionalAdmin: options.force,
  });

  const messages: Record<typeof result.action, string> = {
    created: 'compte cree et promu administrateur',
    promoted: 'compte existant promu administrateur (aucun doublon cree)',
    password_updated: 'mot de passe du compte administrateur mis a jour',
    already_admin: 'compte deja administrateur actif — aucune modification',
  };

  console.log('');
  console.log(`[init-super-admin] ${messages[result.action]}.`);
  console.log(`  e-mail : ${result.email}`);
  console.log(`  profil : ${result.profileId}`);
  console.log('  role   : admin (SUPER_ADMIN_PASTOR)');
  console.log('  statut : approved');
  console.log('');
  console.log('[init-super-admin] vous pouvez vous connecter sur /connexion avec ce compte.');
  console.log('[init-super-admin] aucun e-mail de confirmation n est necessaire : le compte est verifie.');

  await closeDatabase();
}

main().catch(async (error) => {
  if (error instanceof BootstrapError) {
    console.error(`[init-super-admin] ${error.message}`);
    if (error.hint) console.error(`[init-super-admin] ${error.hint}`);
  } else {
    console.error('[init-super-admin] echec', error);
  }
  await closeDatabase().catch(() => undefined);
  process.exit(1);
});
