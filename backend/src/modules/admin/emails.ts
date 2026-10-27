import { z } from 'zod';
import { env } from '../../config/env.js';
import { getDatabase } from '../../db/client.js';
import { recordAudit } from '../../middlewares/audit.js';
import type { AuthProfile } from '../../auth/permissions.js';
import { getSettingsRow } from '../settings/service.js';
import { brandingFrom, broadcastEmail } from '../../services/email/templates.js';
import {
  dispatchPending,
  enqueueEmails,
  outboxStats,
  sendTestEmail,
  unsubscribeUrl,
  type EnqueueInput,
} from '../../services/email/index.js';
import { mailPublicConfig } from '../../services/email/transport.js';
import { AppError } from '../../utils/errors.js';

/**
 * Messagerie d'information : envoi d'un message a plusieurs membres.
 *
 * Regles appliquees ici (cote serveur, jamais seulement dans l'interface) :
 *   - seuls les administrateurs atteignent ces routes ;
 *   - l'audience est resolue en base, jamais fournie sous forme de liste
 *     d'adresses par le client : impossible d'utiliser l'application comme
 *     relais de spam ;
 *   - les membres ayant refuse les messages d'information (`email_opt_out`)
 *     sont exclus des envois groupes, sauf demande explicite ;
 *   - chaque campagne est journalisee dans l'audit avec son volume, sans le
 *     contenu des messages.
 */

export const broadcastSchema = z.object({
  subject: z.string().trim().min(3, 'Objet trop court.').max(160, 'Objet trop long.'),
  body: z.string().trim().min(10, 'Message trop court.').max(8000, 'Message trop long.'),
  // `all_members` est un alias historique de `approved` : il ne visait deja que
  // les membres approuves (on n'ecrit jamais aux demandes en attente). Il reste
  // accepte pour ne pas casser les integrations existantes, mais l'interface ne
  // le propose plus : le libelle laissait croire a un envoi plus large.
  audience: z.enum(['approved', 'all_members', 'role', 'department']).default('approved'),
  role: z.enum(['member', 'department_leader', 'media', 'admin']).optional(),
  departmentId: z.string().uuid().optional(),
  /** Inclure les membres ayant refuse les messages d'information. */
  includeOptOut: z.boolean().default(false),
  /** Envoi immediat apres mise en file (par defaut : oui). */
  sendNow: z.boolean().default(true),
});

export type BroadcastInput = z.infer<typeof broadcastSchema>;

export const testEmailSchema = z.object({
  email: z.string().trim().email('Adresse invalide.'),
});

interface Recipient {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export interface BroadcastResult {
  campaignId: string;
  recipients: number;
  excluded: number;
  sent: number;
  failed: number;
}

/** Resout l'audience en liste de destinataires, avec les exclusions. */
async function resolveRecipients(input: BroadcastInput): Promise<{
  recipients: Recipient[];
  excluded: number;
}> {
  const db = getDatabase();
  const where: string[] = ["status = 'approved'"];
  const params: unknown[] = [];

  if (input.audience === 'role') {
    if (!input.role) throw AppError.badRequest('Precisez le role vise.');
    params.push(input.role);
    where.push(`role = $${params.length}::public.app_role`);
  }

  if (input.audience === 'department') {
    if (!input.departmentId) throw AppError.badRequest('Precisez le departement vise.');
    params.push(input.departmentId);
    where.push(`exists (
      select 1 from public.department_members dm
       where dm.profile_id = public.profiles.id
         and dm.department_id = $${params.length}
         and dm.status = 'active'
    )`);
  }

  // Toutes les audiences ne visent que des membres approuves : une demande en
  // attente ou refusee ne recoit jamais de message d'information.
  const baseWhere = where.join(' and ');

  const { rows } = await db.query<Recipient>(
    `select id, email, first_name, last_name
       from public.profiles
      where ${baseWhere}
        and email is not null and email <> ''
        and (${
          input.includeOptOut ? 'true' : 'email_opt_out = false'
        })
      order by created_at asc`,
    params,
  );

  const { rows: excludedRows } = await db.query<{ total: string }>(
    `select count(*)::text as total from public.profiles
      where ${baseWhere} and email_opt_out = true`,
    params,
  );

  return { recipients: rows, excluded: Number(excludedRows[0]?.total ?? 0) };
}

/** Cree la campagne, met les messages en file et tente l'envoi. */
export async function sendBroadcast(
  input: BroadcastInput,
  actor: AuthProfile,
): Promise<BroadcastResult> {
  const db = getDatabase();
  const { recipients, excluded } = await resolveRecipients(input);

  if (recipients.length === 0) {
    throw AppError.badRequest(
      'Aucun destinataire ne correspond a cette selection (membres approuves uniquement).',
    );
  }

  const settings = await getSettingsRow();
  const brand = brandingFrom(settings);
  const authorName = [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim() || null;

  const { rows: campaignRows } = await db.query<{ id: string }>(
    `insert into public.email_campaigns (subject, body, audience, audience_detail, created_by)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      input.subject,
      input.body,
      input.audience,
      input.audience === 'role' ? (input.role ?? null) : (input.departmentId ?? null),
      actor.id,
    ],
  );
  const campaignId = campaignRows[0]?.id;
  if (!campaignId) throw AppError.internal('Campagne non enregistree.');

  const messages: EnqueueInput[] = recipients.map((recipient) => {
    const fullName = `${recipient.first_name ?? ''} ${recipient.last_name ?? ''}`.trim();
    return {
      to: recipient.email,
      toName: fullName || null,
      profileId: recipient.id,
      campaignId,
      kind: 'broadcast' as const,
      rendered: broadcastEmail(brand, {
        fullName,
        subject: input.subject,
        body: input.body,
        unsubscribeUrl: unsubscribeUrl(recipient.id),
        authorName,
      }),
    };
  });

  await enqueueEmails(db, messages);

  let sent = 0;
  let failed = 0;
  if (input.sendNow) {
    const report = await dispatchPending(messages.length);
    sent = report.sent;
    failed = report.failed;
  }

  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'email.broadcast',
    entityType: 'email_campaign',
    entityId: campaignId,
    metadata: {
      audience: input.audience,
      recipients: recipients.length,
      excluded,
      sent,
      failed,
      subject: input.subject,
    },
  });

  return { campaignId, recipients: recipients.length, excluded, sent, failed };
}

export interface CampaignDto {
  id: string;
  subject: string;
  audience: string;
  audienceDetail: string | null;
  recipients: number;
  sent: number;
  failed: number;
  pending: number;
  createdByName: string | null;
  createdAt: string;
}

/** Historique des campagnes, avec le detail des envois par statut. */
export async function listCampaigns(limit = 30): Promise<CampaignDto[]> {
  const db = getDatabase();
  const { rows } = await db.query<{
    id: string;
    subject: string;
    audience: string;
    audience_detail: string | null;
    created_at: string;
    created_by_name: string | null;
    recipients: string;
    sent: string;
    failed: string;
    pending: string;
  }>(
    `select c.id, c.subject, c.audience, c.audience_detail, c.created_at,
            trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as created_by_name,
            count(o.id)::text as recipients,
            count(o.id) filter (where o.status = 'sent')::text as sent,
            count(o.id) filter (where o.status = 'failed')::text as failed,
            count(o.id) filter (where o.status = 'pending')::text as pending
       from public.email_campaigns c
       left join public.profiles p on p.id = c.created_by
       left join public.email_outbox o on o.campaign_id = c.id
      group by c.id, p.first_name, p.last_name
      order by c.created_at desc
      limit $1`,
    [Math.max(1, Math.min(limit, 200))],
  );

  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    audience: row.audience,
    audienceDetail: row.audience_detail,
    recipients: Number(row.recipients),
    sent: Number(row.sent),
    failed: Number(row.failed),
    pending: Number(row.pending),
    createdByName: row.created_by_name || null,
    createdAt: row.created_at,
  }));
}

/** Verifie la configuration SMTP et envoie un message de controle. */
export async function sendConfigurationTest(
  email: string,
  actor: AuthProfile,
): Promise<{ ok: true }> {
  const db = getDatabase();
  const config = mailPublicConfig();
  if (!config.configured) {
    throw AppError.badRequest(
      'Aucun fournisseur d’envoi n’est configuré (MAIL_DRIVER). Contactez l’administrateur technique.',
    );
  }
  try {
    await sendTestEmail(email);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    await recordAudit(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'email.test.failed',
      entityType: 'settings',
      metadata: { message: message.slice(0, 300) },
    });
    throw AppError.badRequest(`Envoi impossible : ${message}`);
  }
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'email.test',
    entityType: 'settings',
    metadata: { to: email },
  });
  return { ok: true };
}

/** Etat de la messagerie : configuration (sans secrets) et file d'envoi. */
export async function mailStatus() {
  return { config: mailPublicConfig(), outbox: await outboxStats() };
}

/** Relance immediate du traitement de la file (bouton « Envoyer les messages en attente »). */
export async function flushOutbox(actor: AuthProfile) {
  // Relance explicite : on ne respecte pas le delai de temporisation, sinon le
  // bouton semblerait sans effet juste apres un echec.
  const report = await dispatchPending(env.MAIL_BATCH_SIZE, { force: true });
  await recordAudit(getDatabase(), {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'email.outbox.flush',
    entityType: 'email_outbox',
    metadata: { attempted: report.attempted, sent: report.sent, failed: report.failed },
  });
  return report;
}

/** Apercu HTML du message tel qu'il sera recu (avant envoi). */
export async function previewBroadcast(input: {
  subject: string;
  body: string;
  fullName?: string;
  /**
   * Profil servant a signer le lien de desinscription de l'apercu. On utilise
   * celui de l'administrateur qui demande l'apercu : le lien affiche est donc
   * un vrai lien, testable, et non un exemple inerte.
   */
  profileId?: string;
}) {
  const brand = brandingFrom(await getSettingsRow());
  const rendered = broadcastEmail(brand, {
    fullName: input.fullName ?? 'Awa Traoré',
    subject: input.subject,
    body: input.body,
    unsubscribeUrl: unsubscribeUrl(input.profileId ?? null),
  });
  return { subject: rendered.subject, html: rendered.html, text: rendered.text };
}
