import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';

/**
 * Ces tests tournent sur une base PGlite isolee (repertoire temporaire) :
 * ils ne touchent ni aux donnees de developpement, ni a un quelconque service externe.
 */
const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'lfe-api-'));

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.PGLITE_DATA_DIR = path.join(tmpRoot, 'pglite');
process.env.STORAGE_LOCAL_DIR = path.join(tmpRoot, 'uploads');
process.env.SEED_DEMO_DATA = 'false';
process.env.AUTO_MIGRATE = 'true';
process.env.SESSION_SECRET = 'secret-de-test-uniquement-32-caracteres-minimum';
process.env.ADMIN_BOOTSTRAP_EMAIL = 'admin@test.laforteresse.local';
process.env.ADMIN_BOOTSTRAP_PASSWORD = 'AdminTest2026!';
process.env.PUBLIC_API_URL = '';
process.env.CORS_ORIGINS = '';

const API = '/api/v1';
const MEMBER = {
  firstName: 'Awa',
  lastName: 'Traore',
  email: 'awa.traore@test.local',
  password: 'MotDePasse2026!',
  city: 'Abidjan',
};

let app: Express;
let memberAgent: ReturnType<typeof request.agent>;
let adminAgent: ReturnType<typeof request.agent>;

async function approveProfile(email: string) {
  const { getDatabase } = await import('../src/db/client.js');
  await getDatabase().query("update public.profiles set status = 'approved' where email = $1", [email]);
}

beforeAll(async () => {
  const { runMigrations } = await import('../src/db/migrate.js');
  await runMigrations();
  const { createApp } = await import('../src/app.js');
  app = createApp();
  memberAgent = request.agent(app);
  adminAgent = request.agent(app);
}, 60_000);

afterAll(async () => {
  const { closeDatabase } = await import('../src/db/client.js');
  await closeDatabase().catch(() => undefined);
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('API - sante et contenu public', () => {
  it('expose /health', async () => {
    const res = await request(app).get(`${API}/health`).expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('pglite');
  });

  it('renvoie les parametres de l eglise', async () => {
    const res = await request(app).get(`${API}/public/settings`).expect(200);
    expect(res.body.churchName).toBe("La Forteresse de l'Éternel");
    expect(res.body).toHaveProperty('colors');
  });

  it('renvoie une liste paginee de predications', async () => {
    const res = await request(app).get(`${API}/public/sermons`).expect(200);
    expect(Array.isArray(res.body.sermons)).toBe(true);
    expect(res.body.pagination).toMatchObject({ page: 1 });
  });

  it('protège les routes d administration', async () => {
    const res = await request(app).get(`${API}/admin/dashboard`);
    expect([401, 403]).toContain(res.status);
    expect(res.body.error.code).toBeTruthy();
  });
});

describe('API - parcours membre', () => {
  const agent = () => memberAgent;

  it('refuse une inscription invalide', async () => {
    const res = await agent()
      .post(`${API}/auth/register`)
      .send({ firstName: 'A', lastName: 'B', email: 'pas-un-email', password: 'court' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details.issues)).toBe(true);
  });

  it('inscrit puis ouvre une session', async () => {
    const register = await agent().post(`${API}/auth/register`).send(MEMBER).expect(201);
    expect(register.body.profile.email).toBe(MEMBER.email);
    expect(register.body.status).toBe('profile_incomplete');

    const session = await agent().get(`${API}/auth/session`).expect(200);
    expect(session.body.profile.email).toBe(MEMBER.email);
    expect(session.body.permissions.isApproved).toBe(false);
  });

  it('bloque l espace membre avant approbation', async () => {
    const res = await agent().get(`${API}/members/dashboard`);
    expect(res.status).toBe(403);
  });

  it('complete le profil et soumet la demande', async () => {
    const profile = await agent()
      .patch(`${API}/auth/profile`)
      .send({
        city: 'Abidjan',
        phone: '+225 07 00 00 00 00',
        profession: 'Enseignante',
        bio: 'Membre recente de la communaute.',
      })
      .expect(200);
    expect(profile.body.profile.city).toBe('Abidjan');

    const submit = await agent().post(`${API}/auth/profile/submit`).expect(200);
    expect(submit.body.status).toBe('pending_review');
  });

  it('ouvre l espace membre apres approbation', async () => {
    await approveProfile(MEMBER.email);
    const res = await agent().get(`${API}/members/dashboard`).expect(200);
    expect(res.body.profile.email).toBe(MEMBER.email);
  });

  it('enregistre une demande de priere publique', async () => {
    const res = await request(app)
      .post(`${API}/public/prayer-requests`)
      .send({ fullName: 'Visiteur Test', message: 'Priez pour ma famille et mon travail.', category: 'Famille' })
      .expect(201);
    expect(res.body.id).toBeTruthy();
  });

  it('expose les notifications du membre', async () => {
    const res = await agent().get(`${API}/members/notifications`).expect(200);
    expect(Array.isArray(res.body.notifications)).toBe(true);
  });

  it('deconnecte la session', async () => {
    await agent().post(`${API}/auth/logout`).expect(200);
    const res = await agent().get(`${API}/auth/session`).expect(200);
    expect(res.body.profile).toBeNull();
    expect(res.body.permissions).toBeNull();
  });
});

describe('API - administration', () => {
  const admin = () => adminAgent;
  const ADMIN = {
    firstName: 'Aline',
    lastName: 'Koffi',
    email: 'admin.test@laforteresse.local',
    password: 'AdminTest2026!',
  };

  it('connecte un administrateur', async () => {
    await request(app).post(`${API}/auth/register`).send(ADMIN).expect(201);
    const { getDatabase } = await import('../src/db/client.js');
    await getDatabase().query("update public.profiles set role = 'admin', status = 'approved' where email = $1", [
      ADMIN.email,
    ]);

    const res = await admin()
      .post(`${API}/auth/login`)
      .send({ email: ADMIN.email, password: ADMIN.password })
      .expect(200);
    expect(res.body.permissions.isAdmin).toBe(true);
  });

  it('renvoie le tableau de bord', async () => {
    const res = await admin().get(`${API}/admin/dashboard`).expect(200);
    expect(res.body.members.total).toBeGreaterThan(0);
    expect(res.body.finance.currency).toBe('XOF');
  });

  it('cree puis depublie une predication', async () => {
    const created = await admin()
      .post(`${API}/admin/sermons`)
      .send({ title: 'Message de test', speaker: 'Pasteur Test', isPublished: true })
      .expect(201);
    expect(created.body.slug).toBe('message-de-test');

    const updated = await admin()
      .patch(`${API}/admin/sermons/${created.body.id}`)
      .send({ isPublished: false })
      .expect(200);
    expect(updated.body.isPublished).toBe(false);

    await admin().delete(`${API}/admin/sermons/${created.body.id}`).expect(200);
  });

  it('gère les contributions et les dépenses', async () => {
    const created = await admin()
      .post(`${API}/admin/finance/contributions`)
      .send({ donorName: 'Donateur Test', amount: 5000, category: 'offrande', method: 'especes' })
      .expect(201);

    const summary = await admin().get(`${API}/admin/finance/summary`).expect(200);
    expect(summary.body.contributions).toBe(5000);

    await admin().delete(`${API}/admin/finance/contributions/${created.body.id}`).expect(200);
    const after = await admin().get(`${API}/admin/finance/summary`).expect(200);
    expect(after.body.contributions).toBe(0);
  });

  it('journalise les actions sensibles', async () => {
    const res = await admin().get(`${API}/admin/audit-logs`).expect(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs.some((log: { action: string }) => log.action === 'finance.contribution.delete')).toBe(true);
  });
});

/**
 * Permissions sensibles exigees par le cahier des charges :
 *  - un utilisateur ne peut ni s'approuver lui-meme, ni s'attribuer un role ;
 *  - un responsable de departement ne peut pas devenir administrateur ;
 *  - un membre non approuve n'accede pas a l'espace membre ;
 *  - une nomination conserve son historique apres la fin de la fonction.
 */
describe('API - permissions sensibles et historique des nominations', () => {
  const CHEF = {
    firstName: 'Serge',
    lastName: 'Bamba',
    email: 'chef.departement@test.local',
    password: 'ChefDepartement2026!',
  };
  const CANDIDAT = {
    firstName: 'Nadia',
    lastName: 'Kone',
    email: 'candidat.non.approuve@test.local',
    password: 'Candidat2026!',
  };

  let chefAgent: ReturnType<typeof request.agent>;
  let chefId = '';
  let candidatAgent: ReturnType<typeof request.agent>;
  let departmentId = '';

  /** Cree un compte complet, soumet la demande puis approuve directement en base. */
  async function createApprovedProfile(
    account: { firstName: string; lastName: string; email: string; password: string },
    agent: ReturnType<typeof request.agent>,
  ) {
    await agent.post(`${API}/auth/register`).send(account).expect(201);
    await agent
      .patch(`${API}/auth/profile`)
      .send({ city: 'Abidjan', phone: '+225 07 00 00 00 01', profession: 'Benevole' })
      .expect(200);
    await agent.post(`${API}/auth/profile/submit`).expect(200);
    await approveProfile(account.email);
    await agent.post(`${API}/auth/login`).send({ email: account.email, password: account.password }).expect(200);
    const { getDatabase } = await import('../src/db/client.js');
    const { rows } = await getDatabase().query<{ id: string }>(
      'select id from public.profiles where email = $1',
      [account.email],
    );
    return rows[0]?.id ?? '';
  }

  beforeAll(async () => {
    chefAgent = request.agent(app);
    candidatAgent = request.agent(app);

    chefId = await createApprovedProfile(CHEF, chefAgent);
    // Le responsable recoit le role `department_leader`, jamais `admin`.
    await adminAgent
      .patch(`${API}/admin/members/${chefId}/role`)
      .send({ role: 'department_leader' })
      .expect(200);

    // Candidat inscrive : sa demande reste en attente de validation.
    await candidatAgent.post(`${API}/auth/register`).send(CANDIDAT).expect(201);
    await candidatAgent
      .patch(`${API}/auth/profile`)
      .send({ city: 'Abidjan', phone: '+225 07 00 00 00 02', profession: 'Etudiante' })
      .expect(200);
    await candidatAgent.post(`${API}/auth/profile/submit`).expect(200);
  }, 60_000);

  it('empeche un membre non approuve d entrer dans l espace membre', async () => {
    await candidatAgent.get(`${API}/members/dashboard`).expect(403);
  });

  it('empeche un utilisateur de s approuver lui-meme', async () => {
    const { getDatabase } = await import('../src/db/client.js');
    const { rows } = await getDatabase().query<{ id: string }>(
      'select id from public.profiles where email = $1',
      [CANDIDAT.email],
    );
    const candidatId = rows[0]?.id;
    expect(candidatId).toBeTruthy();

    // Un membre non approuve n'a aucun acces aux routes d'administration.
    await candidatAgent
      .patch(`${API}/admin/members/${candidatId}/status`)
      .send({ status: 'approved' })
      .expect(403);

    // Un administrateur ne peut pas valider sa propre fiche non plus.
    const self = await adminAgent.get(`${API}/auth/session`).expect(200);
    await adminAgent
      .patch(`${API}/admin/members/${self.body.profile.id}/status`)
      .send({ status: 'approved' })
      .expect(403);
  });

  it('empeche un responsable de devenir administrateur', async () => {
    const res = await chefAgent
      .patch(`${API}/admin/members/${chefId}/role`)
      .send({ role: 'admin' })
      .expect(403);
    expect(res.body.error.code).toBeTruthy();

    // Le role effectif n'a pas bouge.
    const session = await chefAgent.get(`${API}/auth/session`).expect(200);
    expect(session.body.profile.role).toBe('department_leader');
    expect(session.body.permissions.isAdmin).toBe(false);
  });

  it('enregistre une nomination avec date de debut et historique', async () => {
    const department = await adminAgent
      .post(`${API}/admin/departments`)
      .send({ name: 'Cellule de test', description: 'Departement cree par les tests.' })
      .expect(201);
    departmentId = department.body.id;
    expect(departmentId).toBeTruthy();

    await adminAgent
      .post(`${API}/admin/departments/${departmentId}/members`)
      .send({
        profileId: chefId,
        role: 'leader',
        functionTitle: 'Responsable de cellule',
        startedOn: '2026-01-05',
      })
      .expect(201);

    const members = await adminAgent
      .get(`${API}/admin/departments/${departmentId}/members`)
      .expect(200);
    const membre = members.body.members.find((entry: { profileId: string }) => entry.profileId === chefId);
    expect(membre.functionTitle).toBe('Responsable de cellule');
    expect(membre.startedOn).toBe('2026-01-05');

    const history = await adminAgent
      .get(`${API}/admin/departments/${departmentId}/nominations`)
      .expect(200);
    expect(history.body.nominations).toHaveLength(1);
    expect(history.body.nominations[0]).toMatchObject({
      profileId: chefId,
      memberRole: 'leader',
      status: 'active',
      startedOn: '2026-01-05',
      endedOn: null,
    });

    // Le nombre de responsables actifs remonte dans le tableau de bord.
    const dashboard = await adminAgent.get(`${API}/admin/dashboard`).expect(200);
    expect(dashboard.body.departments.leadersActive).toBeGreaterThanOrEqual(1);
  });

  it('conserve l historique apres la fin de la fonction', async () => {
    await adminAgent
      .delete(`${API}/admin/departments/${departmentId}/members/${chefId}`)
      .expect(200);

    const history = await adminAgent
      .get(`${API}/admin/departments/${departmentId}/nominations`)
      .expect(200);
    expect(history.body.nominations).toHaveLength(1);
    expect(history.body.nominations[0].status).toBe('ended');
    expect(history.body.nominations[0].endedOn).toBeTruthy();

    const byMember = await adminAgent.get(`${API}/admin/members/${chefId}/nominations`).expect(200);
    expect(byMember.body.nominations).toHaveLength(1);
  });

  it('cloture les fonctions en cours quand un departement est archive', async () => {
    // Nouvelle nomination, puis archivage : l'historique doit rester consultable.
    await adminAgent
      .post(`${API}/admin/departments/${departmentId}/members`)
      .send({ profileId: chefId, role: 'assistant', startedOn: '2026-03-01' })
      .expect(201);

    await adminAgent.post(`${API}/admin/departments/${departmentId}/archive`).expect(200);

    const history = await adminAgent
      .get(`${API}/admin/departments/${departmentId}/nominations`)
      .expect(200);
    const active = history.body.nominations.filter(
      (entry: { status: string }) => entry.status === 'active',
    );
    expect(active).toHaveLength(0);
    expect(
      history.body.nominations.some(
        (entry: { endReason: string | null }) => entry.endReason === 'Departement archive',
      ),
    ).toBe(true);
  });
});

/**
 * Messagerie : envoi d'informations aux membres.
 *
 * Les tests utilisent un transport memoire (`MemoryTransport`) : aucun message
 * ne quitte la machine, mais le contenu produit est verifie exactement.
 */
describe('API - messagerie', () => {
  const DESTINATAIRE = {
    firstName: 'Yao',
    lastName: 'Kouassi',
    email: 'yao.kouassi@test.local',
    password: 'Destinataire2026!',
  };
  let destinataireId = '';
  let destinataireAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    destinataireAgent = request.agent(app);
    await destinataireAgent.post(`${API}/auth/register`).send(DESTINATAIRE).expect(201);
    await destinataireAgent
      .patch(`${API}/auth/profile`)
      .send({ city: 'Abidjan', phone: '+225 07 00 00 00 03', profession: 'Comptable' })
      .expect(200);
    await destinataireAgent.post(`${API}/auth/profile/submit`).expect(200);
    const { getDatabase } = await import('../src/db/client.js');
    const { rows } = await getDatabase().query<{ id: string }>(
      'select id from public.profiles where email = $1',
      [DESTINATAIRE.email],
    );
    destinataireId = rows[0]?.id ?? '';
  }, 60_000);

  /** Vide la boite memoire avant chaque scenario. */
  async function resetMailbox() {
    const { setMailTransport, MemoryTransport } = await import(
      '../src/services/email/transport.js'
    );
    const transport = new MemoryTransport();
    setMailTransport(transport);
    return transport;
  }

  it('envoie un e-mail a un membre quand sa demande est approuvee', async () => {
    const transport = await resetMailbox();

    await adminAgent
      .patch(`${API}/admin/members/${destinataireId}/status`)
      .send({ status: 'approved' })
      .expect(200);

    const message = transport.sent.find((entry) => entry.to === DESTINATAIRE.email);
    expect(message).toBeTruthy();
    expect(message?.subject).toContain('adhésion');
    expect(message?.text).toContain('Yao');
    expect(message?.html).toContain('<!DOCTYPE html>');

    // Le message est trace dans la file comme envoye.
    const status = await adminAgent.get(`${API}/admin/emails/status`).expect(200);
    expect(status.body.outbox.sent).toBeGreaterThanOrEqual(1);
  });

  it('envoie un lien de reinitialisation par e-mail', async () => {
    const transport = await resetMailbox();

    const res = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: DESTINATAIRE.email })
      .expect(200);

    // En developpement le lien est aussi renvoye pour faciliter les essais.
    expect(res.body.devResetUrl).toContain('reinitialiser-mot-de-passe');
    const message = transport.sent.find((entry) => entry.to === DESTINATAIRE.email);
    expect(message?.text).toContain('reinitialiser-mot-de-passe');
  });

  it('applique la preference de desinscription aux messages d information', async () => {
    // Le membre refuse les messages d'information.
    await destinataireAgent
      .patch(`${API}/auth/profile`)
      .send({ emailOptOut: true })
      .expect(200);

    const { getDatabase } = await import('../src/db/client.js');
    const { rows } = await getDatabase().query<{ email_opt_out: boolean }>(
      'select email_opt_out from public.profiles where id = $1',
      [destinataireId],
    );
    expect(rows[0]?.email_opt_out).toBe(true);

    const transport = await resetMailbox();
    await adminAgent
      .post(`${API}/admin/emails/broadcast`)
      .send({
        subject: 'Information de la semaine',
        body: 'Voici les nouvelles de la communaute pour cette semaine.',
        audience: 'approved',
        sendNow: true,
      })
      .expect(201);

    // Le membre desinscrit ne doit pas recevoir ce message d'information…
    expect(transport.sent.some((entry) => entry.to === DESTINATAIRE.email)).toBe(false);
    // …mais un message transactionnel le joint toujours.
    const resetTransport = await resetMailbox();
    await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: DESTINATAIRE.email })
      .expect(200);
    expect(resetTransport.sent.some((entry) => entry.to === DESTINATAIRE.email)).toBe(true);

    // Retour a l'etat initial pour les scenarios suivants.
    await destinataireAgent
      .patch(`${API}/auth/profile`)
      .send({ emailOptOut: false })
      .expect(200);
  });

  it('rend le lien de desinscription utilisable sans etre connecte', async () => {
    // 1. Un message d'information part : il contient un lien de desinscription.
    const transport = await resetMailbox();
    await adminAgent
      .post(`${API}/admin/emails/broadcast`)
      .send({
        subject: 'Nouvelles du mois',
        body: 'Retrouvez les nouvelles de la communaute pour ce mois.',
        audience: 'approved',
        sendNow: true,
      })
      .expect(201);

    const message = transport.sent.find((entry) => entry.to === DESTINATAIRE.email);
    expect(message).toBeTruthy();
    const lien = /href="([^"]*\/desinscription\?token=[^"]+)"/.exec(message?.html ?? '');
    expect(lien).toBeTruthy();
    const token = decodeURIComponent(new URL(lien?.[1] ?? '').searchParams.get('token') ?? '');
    expect(token).toContain('.');

    // 2. La verification se fait sans session (page publique).
    const verification = await request(app)
      .get(`${API}/public/unsubscribe`)
      .query({ token })
      .expect(200);
    expect(verification.body.valid).toBe(true);
    expect(verification.body.alreadyUnsubscribed).toBe(false);
    // L'adresse complete n'est jamais renvoyee a la page publique.
    expect(verification.body.maskedEmail).toContain('@');
    expect(verification.body.maskedEmail).not.toContain(DESTINATAIRE.email);

    // 3. La desinscription s'applique, egalement sans session.
    const result = await request(app)
      .post(`${API}/public/unsubscribe`)
      .send({ token })
      .expect(200);
    expect(result.body.changed).toBe(true);
    expect(result.body.maskedEmail).toBe(verification.body.maskedEmail);

    const { getDatabase } = await import('../src/db/client.js');
    const { rows } = await getDatabase().query<{ email_opt_out: boolean }>(
      'select email_opt_out from public.profiles where id = $1',
      [destinataireId],
    );
    expect(rows[0]?.email_opt_out).toBe(true);

    // 4. L'action est journalisee dans l'audit.
    const logs = await adminAgent.get(`${API}/admin/audit-logs?perPage=50`).expect(200);
    const entry = logs.body.logs.find(
      (row: { action: string; entityId: string }) =>
        row.action === 'email.unsubscribe' && row.entityId === destinataireId,
    );
    expect(entry).toBeTruthy();

    // 5. Le second clic est sans effet (idempotence).
    const again = await request(app)
      .post(`${API}/public/unsubscribe`)
      .send({ token })
      .expect(200);
    expect(again.body.changed).toBe(false);

    // Retour a l'etat initial pour les scenarios suivants.
    await destinataireAgent
      .patch(`${API}/auth/profile`)
      .send({ emailOptOut: false })
      .expect(200);
  });

  it('refuse un lien de desinscription altere', async () => {
    const { createUnsubscribeToken } = await import('../src/services/email/unsubscribe.js');
    const token = createUnsubscribeToken(destinataireId);
    // Une seule lettre changee dans la signature invalide le jeton.
    const altere = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

    await request(app).get(`${API}/public/unsubscribe`).query({ token: altere }).expect(400);
    await request(app).post(`${API}/public/unsubscribe`).send({ token: altere }).expect(400);
    // Jeton trop court : refuse par la validation avant tout traitement.
    await request(app).get(`${API}/public/unsubscribe`).query({ token: 'court' }).expect(422);
  });

  it('ne permet pas de desinscrire un profil avec le jeton d un autre', async () => {
    const { getDatabase } = await import('../src/db/client.js');
    const db = getDatabase();
    const { createUnsubscribeToken } = await import('../src/services/email/unsubscribe.js');

    const { rows } = await db.query<{ id: string }>(
      'select id from public.profiles where email = $1',
      ['admin.test@laforteresse.local'],
    );
    const adminId = rows[0]?.id ?? '';
    expect(adminId).not.toBe('');

    // Le jeton du membre est reutilise en remplacant l'identifiant : la
    // signature ne correspond plus, la desinscription est refusee.
    const membreToken = createUnsubscribeToken(destinataireId);
    const [payload, signature] = membreToken.split('.');
    const falsifie = Buffer.from(
      `${adminId}:${Buffer.from(payload ?? '', 'base64url').toString('utf8').split(':')[1]}`,
      'utf8',
    ).toString('base64url');

    await request(app)
      .post(`${API}/public/unsubscribe`)
      .send({ token: `${falsifie}.${signature}` })
      .expect(400);

    const after = await db.query<{ email_opt_out: boolean }>(
      'select email_opt_out from public.profiles where id = $1',
      [adminId],
    );
    expect(after.rows[0]?.email_opt_out).toBe(false);
  });

  it('envoie un message d information aux membres approuves', async () => {
    const transport = await resetMailbox();

    const res = await adminAgent
      .post(`${API}/admin/emails/broadcast`)
      .send({
        subject: 'Culte special dimanche',
        body: 'Le culte de ce dimanche commence a 8h. Toute la communaute est invitee.',
        audience: 'approved',
        sendNow: true,
      })
      .expect(201);

    expect(res.body.recipients).toBeGreaterThan(0);
    expect(res.body.campaignId).toBeTruthy();
    expect(transport.sent.length).toBe(res.body.recipients);
    const message = transport.sent[0];
    expect(message?.subject).toBe('Culte special dimanche');
    expect(message?.text).toContain('8h');
    expect(message?.html).toContain('Se désinscrire');

    // La campagne apparait dans l'historique.
    const campaigns = await adminAgent.get(`${API}/admin/emails/campaigns`).expect(200);
    expect(
      campaigns.body.campaigns.some(
        (campaign: { subject: string; sent: number }) =>
          campaign.subject === 'Culte special dimanche' && campaign.sent > 0,
      ),
    ).toBe(true);
  });

  it('accepte encore l audience historique all_members', async () => {
    // Alias de `approved`, conserve pour ne pas casser les integrations.
    const res = await adminAgent
      .post(`${API}/admin/emails/broadcast`)
      .send({
        subject: 'Information historique',
        body: 'Message envoye via l alias historique de l audience.',
        audience: 'all_members',
        sendNow: false,
      })
      .expect(201);
    expect(res.body.recipients).toBeGreaterThanOrEqual(0);
  });

  it('refuse un message d information aux membres simples', async () => {
    const transport = await resetMailbox();
    const res = await destinataireAgent
      .post(`${API}/admin/emails/broadcast`)
      .send({ subject: 'Test interdit', body: 'Ce message ne doit pas partir.' });
    expect(res.status).toBe(403);
    expect(transport.sent).toHaveLength(0);
  });

  it('rejette une audience vide ou invalide', async () => {
    const res = await adminAgent
      .post(`${API}/admin/emails/broadcast`)
      .send({ subject: 'x', body: 'court' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('reessaie un envoi en echec puis le marque comme envoye', async () => {
    const { setMailTransport, MemoryTransport } = await import(
      '../src/services/email/transport.js'
    );
    const transport = new MemoryTransport();
    // Le fournisseur echoue une fois : le message reste en attente.
    transport.failNext = 1;
    setMailTransport(transport);

    await adminAgent
      .post(`${API}/admin/emails/broadcast`)
      .send({
        subject: 'Message avec panne simulee',
        body: 'Ce message doit etre rejoue apres une panne temporaire.',
        audience: 'approved',
        sendNow: true,
      })
      .expect(201);

    const statusAfterFailure = await adminAgent.get(`${API}/admin/emails/status`).expect(200);
    expect(statusAfterFailure.body.outbox.pending).toBeGreaterThanOrEqual(1);

    // Deuxieme passage : la file est videe.
    const flush = await adminAgent.post(`${API}/admin/emails/flush`).expect(200);
    expect(flush.body.sent).toBeGreaterThanOrEqual(1);
  });
});

/**
 * Initialisation du compte principal (pasteur / SUPER_ADMIN_PASTOR).
 *
 * Le mot de passe n'est jamais fourni par l'environnement : ces tests appellent
 * la logique du script avec un mot de passe de test, sur la base isolee.
 */
describe('Initialisation du compte principal', () => {
  const PASTOR = {
    email: 'Pasteur.Principal@test.local',
    password: 'PasteurPrincipal2026!',
    firstName: 'Joanne',
    lastName: 'Gnava',
  };

  it('cree le compte principal, hache le mot de passe et accorde les permissions', async () => {
    const { initSuperAdmin, inspectSuperAdmin } = await import('../src/auth/bootstrap.js');
    const { getDatabase } = await import('../src/db/client.js');
    const db = getDatabase();

    // Aucun administrateur au depart : l'initialisation est autorisee.
    const before = await inspectSuperAdmin(db, PASTOR.email);
    expect(before.exists).toBe(false);

    // `allowAdditionalAdmin` est necessaire ici : les scenarios precedents de ce
    // fichier ont deja cree un administrateur dans cette base isolee. En
    // production, la base ne contient aucun administrateur et le garde-fou
    // s'applique (voir le dernier scenario de ce bloc).
    const result = await initSuperAdmin(db, { ...PASTOR, allowAdditionalAdmin: true });
    expect(result.action).toBe('created');

    const state = await inspectSuperAdmin(db, PASTOR.email);
    expect(state.role).toBe('admin');
    expect(state.status).toBe('approved');
    expect(state.hasPassword).toBe(true);

    // Le mot de passe n'est jamais stocke en clair.
    const { rows } = await db.query<{ encrypted_password: string | null }>(
      `select u.encrypted_password from auth.users u
        join public.profiles p on p.id = u.id
       where lower(p.email) = lower($1)`,
      [PASTOR.email],
    );
    const stored = rows[0]?.encrypted_password ?? '';
    expect(stored).not.toContain(PASTOR.password);
    expect(stored.startsWith('scrypt$')).toBe(true);

    // Le compte se connecte reellement et recoit toutes les permissions.
    const agent = request.agent(app);
    const login = await agent
      .post(`${API}/auth/login`)
      .send({ email: PASTOR.email, password: PASTOR.password })
      .expect(200);
    expect(login.body.profile.role).toBe('admin');
    expect(login.body.permissions.isAdmin).toBe(true);

    const dashboard = await agent.get(`${API}/admin/dashboard`).expect(200);
    expect(dashboard.body.members).toBeTruthy();

    // L'operation est journalisee.
    const audit = await agent.get(`${API}/admin/audit-logs`).expect(200);
    expect(
      audit.body.logs.some((log: { action: string }) => log.action === 'admin.bootstrap'),
    ).toBe(true);
  });

  it('ne cree pas de doublon quand le compte existe deja', async () => {
    const { initSuperAdmin } = await import('../src/auth/bootstrap.js');
    const { getDatabase } = await import('../src/db/client.js');
    const db = getDatabase();

    const result = await initSuperAdmin(db, PASTOR);
    expect(result.action).toBe('already_admin');

    const { rows } = await db.query<{ total: string }>(
      'select count(*)::text as total from public.profiles where lower(email) = lower($1)',
      [PASTOR.email],
    );
    expect(Number(rows[0]?.total)).toBe(1);
  });

  it('refuse un mot de passe trop faible sans rien ecrire', async () => {
    const { initSuperAdmin, inspectSuperAdmin, BootstrapError } = await import(
      '../src/auth/bootstrap.js'
    );
    const { getDatabase } = await import('../src/db/client.js');
    const db = getDatabase();

    await expect(
      initSuperAdmin(db, { email: 'faible@test.local', password: 'court' }),
    ).rejects.toBeInstanceOf(BootstrapError);

    const state = await inspectSuperAdmin(db, 'faible@test.local');
    expect(state.exists).toBe(false);
  });

  it('refuse la promotion implicite d un compte ordinaire', async () => {
    const { initSuperAdmin, inspectSuperAdmin } = await import('../src/auth/bootstrap.js');
    const { getDatabase } = await import('../src/db/client.js');
    const db = getDatabase();

    // Compte de test cree par les scenarios precedents, non administrateur.
    const cible = 'yousef.membre@test.local';
    await db.query(
      `insert into auth.users (id, email, encrypted_password, email_confirmed_at)
       values (gen_random_uuid(), $1, null, now())`,
      [cible],
    );
    const { rows } = await db.query<{ id: string }>(
      'select id from auth.users where lower(email) = $1',
      [cible],
    );
    await db.query(
      `insert into public.profiles (id, email, first_name, last_name, status, role)
       values ($1, $2, 'Yousef', 'Membre', 'approved', 'member')`,
      [rows[0]?.id, cible],
    );

    // Sans --promote : refus explicite, aucune elevation silencieuse.
    await expect(
      initSuperAdmin(db, { email: cible, password: 'MotDePasseSolide2026!' }),
    ).rejects.toThrow(/existe deja/i);

    const before = await inspectSuperAdmin(db, cible);
    expect(before.role).toBe('member');

    // Avec --promote : elevation explicite, journalisee, sans doublon.
    const promoted = await initSuperAdmin(db, {
      email: cible,
      password: 'MotDePasseSolide2026!',
      promote: true,
    });
    expect(promoted.action).toBe('promoted');
    const after = await inspectSuperAdmin(db, cible);
    expect(after.role).toBe('admin');
    expect(after.status).toBe('approved');

    const { rows: count } = await db.query<{ total: string }>(
      'select count(*)::text as total from public.profiles where lower(email) = lower($1)',
      [cible],
    );
    expect(Number(count[0]?.total)).toBe(1);
  });

  it('refuse de creer un second administrateur sans --force', async () => {
    const { initSuperAdmin, BootstrapError } = await import('../src/auth/bootstrap.js');
    const { getDatabase } = await import('../src/db/client.js');
    const db = getDatabase();

    await expect(
      initSuperAdmin(db, { email: 'intrus@test.local', password: 'IntrusSolide2026!' }),
    ).rejects.toBeInstanceOf(BootstrapError);
  });
});
