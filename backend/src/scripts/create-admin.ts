import { env, isProduction } from '../config/env.js';
import { closeDatabase, getDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { hashPassword, passwordIssues } from '../auth/password.js';
import { recordAudit } from '../middlewares/audit.js';

/**
 * Initialisation securisee du premier administrateur.
 * Aucun identifiant par defaut : l'e-mail et le mot de passe viennent de
 * l'environnement (ou des arguments CLI).
 */
async function main() {
  const db = getDatabase();
  await runMigrations({ silent: true });

  const email = (process.argv[2] ?? env.ADMIN_BOOTSTRAP_EMAIL ?? '').trim().toLowerCase();
  const password = process.argv[3] ?? env.ADMIN_BOOTSTRAP_PASSWORD ?? '';
  const firstName = env.ADMIN_BOOTSTRAP_FIRST_NAME || 'Administrateur';
  const lastName = env.ADMIN_BOOTSTRAP_LAST_NAME || 'Principal';

  if (!email || !password) {
    console.error(
      [
        'Usage : npm run create-admin -- <email> <mot-de-passe>',
        '   ou : renseignez ADMIN_BOOTSTRAP_EMAIL et ADMIN_BOOTSTRAP_PASSWORD dans backend/.env',
        '',
        'Le mot de passe doit contenir au moins 10 caracteres, une lettre et un chiffre.',
      ].join('\n'),
    );
    process.exit(1);
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Adresse e-mail invalide.');
    process.exit(1);
  }

  const issues = passwordIssues(password);
  if (issues.length > 0) {
    console.error(`Mot de passe trop faible : il manque ${issues.join(', ')}.`);
    process.exit(1);
  }

  const existing = await db.query<{ id: string; role: string }>(
    'select id, role from public.profiles where lower(email) = $1 limit 1',
    [email],
  );

  if (existing.rows[0]) {
    const profileId = existing.rows[0].id;
    await db.query(
      `update public.profiles set role = 'admin', status = 'approved', reviewed_at = now()
       where id = $1`,
      [profileId],
    );
    await db.query(
      `insert into public.membership_history (profile_id, status, note)
       values ($1, 'approved', 'Promotion administrateur via create-admin')`,
      [profileId],
    );
    await recordAudit(db, {
      actorEmail: email,
      action: 'admin.bootstrap_existing',
      entityType: 'profile',
      entityId: profileId,
    });
    console.log(`[create-admin] compte existant promu administrateur : ${email}`);
    await closeDatabase();
    return;
  }

  const passwordHash = await hashPassword(password);
  const profileId = await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, now(), $3) returning id`,
      [email, passwordHash, JSON.stringify({ first_name: firstName, last_name: lastName })],
    );
    const id = rows[0].id;
    await tx.query(
      `insert into public.profiles (id, email, first_name, last_name, status, role, reviewed_at)
       values ($1, $2, $3, $4, 'approved', 'admin', now())`,
      [id, email, firstName, lastName],
    );
    await tx.query(
      `insert into public.membership_history (profile_id, status, note)
       values ($1, 'approved', 'Initialisation du premier administrateur')`,
      [id],
    );
    return id;
  });

  await recordAudit(db, {
    actorId: profileId,
    actorEmail: email,
    action: 'admin.bootstrap',
    entityType: 'profile',
    entityId: profileId,
  });

  console.log(`[create-admin] administrateur cree : ${email}`);
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
