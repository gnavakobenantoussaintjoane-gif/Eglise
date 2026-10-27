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
