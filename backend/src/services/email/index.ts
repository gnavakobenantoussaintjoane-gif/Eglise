import { getDatabase, type Queryable } from '../../db/client.js';
import { env, isProduction, isTest } from '../../config/env.js';
import { getSettingsRow } from '../../modules/settings/service.js';
import {
  brandingFrom,
  broadcastEmail,
  membershipApprovedEmail,
  membershipRejectedEmail,
  nominationEmail,
  passwordResetEmail,
  testEmail,
  type RenderedEmail,
} from './templates.js';
import {
  closeMailTransport,
  getMailTransport,
  type OutgoingMessage,
} from './transport.js';

export { closeMailTransport };

/**
 * File d'envoi des e-mails.
 *
 * Principe : un e-mail n'est jamais envoye « a la volee » depuis une requete
 * HTTP. Il est d'abord ecrit dans `email_outbox`, puis l'expediteur le prend en
 * charge. Trois consequences utiles :
 *   1. un fournisseur SMTP lent ou indisponible ne fait pas echouer une action
 *      metier (approbation d'un membre, reinitialisation de mot de passe) ;
 *   2. un echec temporaire est rejoue automatiquement ;
 *   3. chaque envoi est trace et consultable par l'administrateur.
 *
 * `dispatchPending()` tente l'envoi immediatement (utile en developpement et
 * pour les messages transactionnels) ; le worker d'arriere-plan reprend
 * periodiquement les messages restants et les echecs.
 */

export const EMAIL_KINDS = ['broadcast', 'transactional', 'test'] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export interface EnqueueInput {
  to: string;
  toName?: string | null;
  profileId?: string | null;
  campaignId?: string | null;
  kind: EmailKind;
  rendered: RenderedEmail;
}

export interface OutboxStats {
  pending: number;
  sent: number;
  failed: number;
  lastError: string | null;
}

/** Adresse de desinscription incluse dans les messages d'information. */
export function unsubscribeUrl(profileId: string | null | undefined): string | null {
  if (!profileId) return null;
  return `${env.FRONTEND_URL}/espace-membre/profil?desinscription=${profileId}`;
}

/** Ecrit un ou plusieurs messages dans la file, en une seule requete. */
export async function enqueueEmails(
  db: Queryable,
  inputs: EnqueueInput[],
): Promise<number> {
  const valid = inputs.filter((input) => input.to.includes('@'));
  if (valid.length === 0) return 0;

  // Insertion groupee : un seul aller-retour pour une campagne de plusieurs
  // centaines de membres.
  const columns = 8;
  const values: unknown[] = [];
  const rows: string[] = [];
  valid.forEach((input, index) => {
    const base = index * columns;
    const placeholders = Array.from({ length: columns }, (_, offset) => `$${base + offset + 1}`);
    rows.push(`(${placeholders.join(', ')})`);
    values.push(
      input.campaignId ?? null,
      input.profileId ?? null,
      input.to,
      input.toName ?? null,
      input.kind,
      input.rendered.subject,
      input.rendered.text,
      input.rendered.html,
    );
  });

  await db.query(
    `insert into public.email_outbox
       (campaign_id, profile_id, recipient_email, recipient_name, kind, subject, body_text, body_html)
     values ${rows.join(', ')}`,
    values,
  );

  return valid.length;
}

interface OutboxRow {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  body_text: string;
  body_html: string;
  attempts: number;
}

export interface DispatchReport {
  attempted: number;
  sent: number;
  failed: number;
  skipped: boolean;
  error?: string;
}

/**
 * Prend en charge jusqu'a `limit` messages en attente et tente de les envoyer.
 *
 * Le verrouillage (`for update skip locked`) permet a plusieurs processus de
 * travailler sans se marcher dessus : deux workers ne prendront jamais la meme
 * ligne. Chaque echec incremente `attempts` et repousse la prochaine tentative
 * (1, 2, 4, 8… minutes, plafonne).
 */
export async function dispatchPending(
  limit = env.MAIL_BATCH_SIZE,
  options: { force?: boolean } = {},
): Promise<DispatchReport> {
  const transport = getMailTransport();
  if (transport.name === 'off') {
    return { attempted: 0, sent: 0, failed: 0, skipped: true, error: 'MAIL_DRIVER=off' };
  }

  const db = getDatabase();
  const report: DispatchReport = { attempted: 0, sent: 0, failed: 0, skipped: false };

  // `force` : une relance demandee par un administrateur ignore le delai de
  // temporisation des nouvelles tentatives.
  const { rows } = await db.query<OutboxRow>(
    `select id, recipient_email, recipient_name, subject, body_text, body_html, attempts
       from public.email_outbox
      where status = 'pending' and ($2::boolean or scheduled_at <= now())
      order by created_at asc
      limit $1
      for update skip locked`,
    [Math.max(1, Math.min(limit, 200)), options.force ?? false],
  );

  for (const row of rows) {
    report.attempted += 1;
    const message: OutgoingMessage = {
      to: row.recipient_email,
      toName: row.recipient_name,
      subject: row.subject,
      text: row.body_text,
      html: row.body_html,
    };
    try {
      const result = await transport.send(message);
      await db.query(
        `update public.email_outbox
            set status = 'sent', attempts = attempts + 1, sent_at = now(), last_error = null
          where id = $1`,
        [row.id],
      );
      report.sent += 1;
      if (transport.name === 'log') {
        console.log(`[mail] envoye (log) a ${row.recipient_email} — ${result.messageId}`);
      }
    } catch (error) {
      report.failed += 1;
      const attempts = row.attempts + 1;
      const message_ = error instanceof Error ? error.message : 'Erreur inconnue';
      // Backoff exponentiel plafonne a 60 minutes.
      const delayMinutes = Math.min(2 ** attempts, 60);
      const finalFailure = attempts >= env.MAIL_MAX_ATTEMPTS;
      await db.query(
        `update public.email_outbox
            set status = $2,
                attempts = $3,
                last_error = $4,
                scheduled_at = now() + ($5 || ' minutes')::interval
          where id = $1`,
        [row.id, finalFailure ? 'failed' : 'pending', attempts, message_.slice(0, 500), delayMinutes],
      );
      console.error(
        `[mail] echec ${finalFailure ? 'definitif' : 'temporaire'} a=${row.recipient_email} tentative=${attempts} : ${message_}`,
      );
    }
  }

  return report;
}

/** Envoi immediat sans passer par la file (test de configuration). */
export async function sendDirect(message: OutgoingMessage): Promise<void> {
  await getMailTransport().send(message);
}

/** Statistiques de la file, affichees dans l'espace d'administration. */
export async function outboxStats(): Promise<OutboxStats> {
  const db = getDatabase();
  const { rows } = await db.query<{
    pending: string;
    sent: string;
    failed: string;
    last_error: string | null;
  }>(
    `select
       count(*) filter (where status = 'pending')::text as pending,
       count(*) filter (where status = 'sent')::text as sent,
       count(*) filter (where status = 'failed')::text as failed,
       (select last_error from public.email_outbox
         where last_error is not null order by updated_at desc limit 1) as last_error
     from public.email_outbox`,
  );
  const row = rows[0];
  return {
    pending: Number(row?.pending ?? 0),
    sent: Number(row?.sent ?? 0),
    failed: Number(row?.failed ?? 0),
    lastError: row?.last_error ?? null,
  };
}

/**
 * Envoie un message transactionnel a un membre precis.
 *
 * Les messages transactionnels ignorent volontairement la preference
 * `email_opt_out` : ils portent une information necessaire a l'acces au compte.
 * Ils ne bloquent jamais l'action metier en cours (erreur seulement journalisee).
 */
export async function sendTransactional(
  db: Queryable,
  input: {
    profileId: string;
    email: string;
    fullName?: string | null;
    kind: 'transactional';
    rendered: RenderedEmail;
  },
): Promise<void> {
  try {
    await enqueueEmails(db, [
      {
        to: input.email,
        toName: input.fullName ?? null,
        profileId: input.profileId,
        kind: input.kind,
        rendered: input.rendered,
      },
    ]);
    // Envoi immediat : l'utilisateur attend ce message (lien de reinitialisation).
    await dispatchPending(5);
  } catch (error) {
    console.error('[mail] mise en file impossible', error);
  }
}

// ---------------------------------------------------------------------------
// Messages metier pre-ecrits
// ---------------------------------------------------------------------------

async function branding() {
  try {
    return brandingFrom(await getSettingsRow());
  } catch (error) {
    // Sans parametres accessibles, le modele utilise ses valeurs par defaut.
    console.error('[mail] parametres de l eglise illisibles', error);
    return brandingFrom(null);
  }
}

export async function sendPasswordResetEmail(
  db: Queryable,
  profile: { id: string; email: string; fullName?: string | null },
  resetUrl: string,
): Promise<void> {
  const brand = await branding();
  await sendTransactional(db, {
    profileId: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    kind: 'transactional',
    rendered: passwordResetEmail(brand, { fullName: profile.fullName ?? '', resetUrl }),
  });
}

export async function sendMembershipDecisionEmail(
  db: Queryable,
  profile: { id: string; email: string; fullName?: string | null },
  decision: 'approved' | 'rejected',
  options: { note?: string | null; loginUrl?: string } = {},
): Promise<void> {
  const brand = await branding();
  const rendered =
    decision === 'approved'
      ? membershipApprovedEmail(brand, {
          fullName: profile.fullName ?? '',
          loginUrl: options.loginUrl ?? `${env.FRONTEND_URL}/connexion`,
        })
      : membershipRejectedEmail(brand, { fullName: profile.fullName ?? '', note: options.note });
  await sendTransactional(db, {
    profileId: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    kind: 'transactional',
    rendered,
  });
}

export async function sendNominationEmail(
  db: Queryable,
  profile: { id: string; email: string; fullName?: string | null },
  assignment: {
    departmentName: string;
    roleLabel: string;
    functionTitle?: string | null;
    startedOn?: string | null;
  },
): Promise<void> {
  const brand = await branding();
  await sendTransactional(db, {
    profileId: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    kind: 'transactional',
    rendered: nominationEmail(brand, { fullName: profile.fullName ?? '', ...assignment }),
  });
}

export async function sendTestEmail(to: string): Promise<void> {
  const brand = await branding();
  const rendered = testEmail(brand, { sentAt: new Date().toLocaleString('fr-FR') });
  await sendDirect({
    to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });
}

export { broadcastEmail };

// ---------------------------------------------------------------------------
// Worker d'arriere-plan
// ---------------------------------------------------------------------------

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const report = await dispatchPending();
    if (report.sent > 0 || report.failed > 0) {
      console.log(
        `[mail] file : ${report.sent} envoye(s), ${report.failed} en echec, ${report.attempted} traite(s)`,
      );
    }
  } catch (error) {
    console.error('[mail] worker : erreur de traitement', error);
  } finally {
    running = false;
  }
}

/**
 * Demarre l'expediteur periodique. Sans effet en test, si `MAIL_DRIVER=off` ou
 * si `MAIL_WORKER_ENABLED=false` : dans ces cas, seul un envoi explicite
 * (`dispatchPending`) a lieu.
 */
export function startMailWorker(): void {
  if (isTest || timer) return;
  if (!env.MAIL_WORKER_ENABLED || env.MAIL_DRIVER === 'off') {
    console.log('[mail] worker desactive (MAIL_WORKER_ENABLED=false ou MAIL_DRIVER=off)');
    return;
  }
  const intervalMs = env.MAIL_WORKER_INTERVAL_SECONDS * 1000;
  timer = setInterval(() => void tick(), intervalMs);
  // Le minuteur ne doit pas empecher l'arret du processus.
  timer.unref();
  console.log(
    `[mail] worker actif : envoi toutes les ${env.MAIL_WORKER_INTERVAL_SECONDS}s (mode ${env.MAIL_DRIVER})`,
  );
  if (isProduction && env.MAIL_DRIVER !== 'smtp') {
    console.warn(
      '[mail] ATTENTION : MAIL_DRIVER n est pas « smtp » en production — aucun e-mail ne sera reellement envoye.',
    );
  }
  // Premier passage rapide pour vider une eventuelle file existante.
  setTimeout(() => void tick(), 2_000).unref();
}

export function stopMailWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
