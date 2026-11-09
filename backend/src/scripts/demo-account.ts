import { env, isProduction } from '../config/env.js';
import { closeDatabase, getDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import {
  DEMO_ROLES,
  DEMO_ROLE_LABEL,
  DemoAccountError,
  createDemoAccount,
  generateDemoPassword,
  type DemoRole,
} from '../auth/demo-account.js';

/**
 * Crée un compte de démonstration, modifiable ensuite dans l'application.
 *
 * Usage :
 *   npm run demo:account
 *   npm run demo:account -- --email demo@exemple.ci
 *   npm run demo:account -- --role media
 *   npm run demo:account -- --email demo@exemple.ci --reset   # applique les changements
 *
 * Le mot de passe est généré aléatoirement et affiché une seule fois : c'est un
 * compte de bac à sable, pas un compte réel. Pour imposer une valeur (CI,
 * démonstration guidée), définissez `DEMO_ACCOUNT_PASSWORD` dans l'environnement
 * — jamais en argument de commande, où il resterait dans l'historique du shell.
 */

interface CliOptions {
  email: string;
  role: DemoRole;
  firstName: string;
  lastName: string;
  reset: boolean;
  force: boolean;
}

const DEFAULT_EMAIL = 'demo@laforteresse.local';

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    email: DEFAULT_EMAIL,
    role: 'member',
    firstName: 'Compte',
    lastName: 'Démo',
    reset: false,
    force: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        throw new DemoAccountError(`Valeur manquante après ${arg}.`);
      }
      index += 1;
      return next;
    };

    switch (arg) {
      case '--email':
        options.email = value();
        break;
      case '--role': {
        const role = value();
        if (!(DEMO_ROLES as readonly string[]).includes(role)) {
          throw new DemoAccountError(
            `Rôle inconnu : « ${role} ».`,
            `Rôles acceptés : ${DEMO_ROLES.join(', ')}.`,
          );
        }
        options.role = role as DemoRole;
        break;
      }
      case '--first-name':
        options.firstName = value();
        break;
      case '--last-name':
        options.lastName = value();
        break;
      case '--reset':
        options.reset = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new DemoAccountError(
          `Option inconnue : « ${arg} ».`,
          'Lancez `npm run demo:account -- --help` pour voir les options.',
        );
    }
  }

  return options;
}

function printUsage(): void {
  console.log(
    [
      '',
      '  Créer un compte de démonstration (modifiable ensuite)',
      '',
      '  npm run demo:account                    compte demo@laforteresse.local, rôle member',
      '  npm run demo:account -- --role media    autre rôle',
      '  npm run demo:account -- --email ...     autre adresse',
      '  npm run demo:account -- --reset         applique les changements à un compte existant',
      '',
      `  Rôles : ${DEMO_ROLES.map((role) => `${role} (${DEMO_ROLE_LABEL[role]})`).join(', ')}`,
      '',
      '  Le mot de passe est généré et affiché une seule fois. Pour le choisir :',
      '  définissez DEMO_ACCOUNT_PASSWORD dans l’environnement (jamais en argument).',
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  // Un compte de démonstration sur une base de production est une porte
  // ouverte : la commande s'arrête, sauf demande explicite.
  if (isProduction && !options.force) {
    throw new DemoAccountError(
      'Refusé : NODE_ENV=production.',
      'Un compte de démonstration n’a pas sa place en production. Relancez avec --force si vous êtes certain de vouloir le créer.',
    );
  }

  const password = process.env.DEMO_ACCOUNT_PASSWORD || generateDemoPassword();
  const generated = !process.env.DEMO_ACCOUNT_PASSWORD;

  const db = getDatabase();
  await runMigrations({ silent: true });

  const result = await createDemoAccount(db, {
    email: options.email,
    password,
    role: options.role,
    firstName: options.firstName,
    lastName: options.lastName,
    reset: options.reset,
  });

  // L'interface de développement écoute sur FRONTEND_URL (3000 par défaut).
  const frontendUrl = env.FRONTEND_URL.replace(/\/+$/, '');

  console.log('');
  console.log('  Compte de démonstration');
  console.log('  ' + '-'.repeat(58));

  if (result.action === 'unchanged') {
    console.log(`  · le compte ${result.email} existe déjà (rôle ${result.role})`);
    console.log('  · rien n’a été modifié');
    console.log('');
    console.log('  Pour appliquer un changement de rôle ou de mot de passe :');
    console.log(`    npm run demo:account -- --email ${result.email} --role ${options.role} --reset`);
  } else {
    console.log(`  ✓ ${result.action === 'created' ? 'compte créé' : 'compte mis à jour'}`);
    if (result.action === 'updated') {
      for (const change of result.changes) console.log(`    ${change}`);
    }
    console.log('');
    console.log(`  E-mail    : ${result.email}`);
    console.log(`  Mot de passe : ${password}${generated ? '   (généré, affiché une seule fois)' : '   (DEMO_ACCOUNT_PASSWORD)'}`);
    console.log(`  Rôle      : ${result.role} (${DEMO_ROLE_LABEL[result.role]})`);
    console.log(`  Statut    : approuvé — connexion immédiate`);
  }

  console.log('');
  console.log(`  Connexion : ${frontendUrl}/connexion`);
  console.log('');
  console.log('  Modifier ce compte ensuite :');
  console.log('    · le titulaire   : espace membre → Mon profil (nom, ville, téléphone, photo…)');
  console.log('    · l’administrateur : /admin/members → Examiner (rôle, statut, restrictions)');
  console.log('    · mot de passe   : « Mot de passe oublié » sur la page de connexion, ou POST /auth/password');
  console.log('');
}

main()
  .catch((error: unknown) => {
    if (error instanceof DemoAccountError) {
      console.error(`\n  ✗ ${error.message}`);
      if (error.hint) console.error(`    ${error.hint}`);
      console.error('');
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    // PGlite est mono-processus : sans fermeture, le script laisse la base
    // verrouillée pour la commande suivante.
    await closeDatabase().catch(() => undefined);
  });
