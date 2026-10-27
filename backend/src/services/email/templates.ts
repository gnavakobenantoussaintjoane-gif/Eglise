import { env } from '../../config/env.js';
import type { ChurchSettingsRow } from '../../modules/settings/service.js';

/**
 * Modeles de messages en francais.
 *
 * Chaque modele produit une version texte ET une version HTML. La version texte
 * n'est pas un pis-aller : de nombreux clients mobiles et filtres antispam la
 * privilegient, et elle reste lisible sans images ni mise en forme.
 *
 * Le HTML est volontairement sobre (tableaux, styles en ligne) : c'est le seul
 * format fiable dans les clients de messagerie, qui ignorent les feuilles de
 * style externes.
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface BrandingContext {
  churchName: string;
  churchEmail: string | null;
  churchPhone: string | null;
  churchCity: string | null;
  colorPrimary: string;
  colorAccent: string;
  logoUrl: string | null;
  siteUrl: string;
}

/** Contexte de marque construit a partir des parametres de l'eglise. */
export function brandingFrom(settings: ChurchSettingsRow | null): BrandingContext {
  return {
    churchName: settings?.church_name ?? "La Forteresse de l'Éternel",
    churchEmail: settings?.email ?? null,
    churchPhone: settings?.phone ?? null,
    churchCity: settings?.city ?? null,
    colorPrimary: settings?.color_primary ?? '#4C1D95',
    colorAccent: settings?.color_accent ?? '#7C3AED',
    logoUrl: null,
    siteUrl: env.FRONTEND_URL,
  };
}

/** Echappe le texte insere dans le HTML (les messages sont saisis par un humain). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convertit un texte simple en HTML : les paragraphes sont preserves, les liens
 * http(s) deviennent cliquables. Aucune balise saisie par l'utilisateur n'est
 * conservee : tout est echappe d'abord.
 */
function textToHtmlParagraphs(value: string): string {
  const paragraphs = value
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const withLinks = escapeHtml(block).replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" style="color:#4C1D95;text-decoration:underline;">$1</a>',
      );
      return `<p style="margin:0 0 14px 0;line-height:1.6;">${withLinks.replace(/\n/g, '<br />')}</p>`;
    });
  return paragraphs.join('');
}

interface LayoutOptions {
  branding: BrandingContext;
  title: string;
  bodyHtml: string;
  /** Lien de desinscription, affiche uniquement pour les messages d'information. */
  unsubscribeUrl?: string | null;
  /** Ligne de bas de page affichee en petit sous le message. */
  footnote?: string | null;
}

/** Squelette HTML commun a tous les messages. */
export function renderLayout(options: LayoutOptions): string {
  const { branding, title, bodyHtml, unsubscribeUrl, footnote } = options;
  const contactLines = [branding.churchEmail, branding.churchPhone, branding.churchCity]
    .filter(Boolean)
    .map((value) => escapeHtml(String(value)))
    .join(' · ');

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F4F2FA;font-family:Helvetica,Arial,sans-serif;color:#1F1B2E;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2FA;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:${branding.colorPrimary};padding:22px 28px;">
                <p style="margin:0;font-size:18px;font-weight:bold;color:#FFFFFF;">${escapeHtml(branding.churchName)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 18px 0;font-size:21px;line-height:1.3;color:${branding.colorPrimary};">${escapeHtml(title)}</h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#FAF9FD;border-top:1px solid #E8E4F2;">
                <p style="margin:0 0 6px 0;font-size:12px;color:#6B6480;">
                  ${escapeHtml(branding.churchName)}${contactLines ? ` — ${contactLines}` : ''}
                </p>
                <p style="margin:0;font-size:12px;color:#6B6480;">
                  <a href="${escapeHtml(branding.siteUrl)}" style="color:${branding.colorAccent};text-decoration:none;">${escapeHtml(branding.siteUrl)}</a>
                </p>
                ${footnote ? `<p style="margin:10px 0 0 0;font-size:11px;color:#8B84A0;">${escapeHtml(footnote)}</p>` : ''}
                ${
                  unsubscribeUrl
                    ? `<p style="margin:10px 0 0 0;font-size:11px;color:#8B84A0;">Vous recevez ce message car vous êtes membre de la communauté. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#8B84A0;">Se désinscrire des messages d’information</a>.</p>`
                    : ''
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const SIGNATURE = 'Que la paix soit avec vous.';

interface MemberGreeting {
  fullName: string;
}

function greeting(name: string): string {
  return name ? `Bonjour ${name},` : 'Bonjour,';
}

/** Mot de passe oublie — message transactionnel (jamais desinscriptible). */
export function passwordResetEmail(
  branding: BrandingContext,
  input: { resetUrl: string; validHours?: number } & MemberGreeting,
): RenderedEmail {
  const hours = input.validHours ?? 1;
  const subject = `Réinitialisation de votre mot de passe — ${branding.churchName}`;
  const bodyHtml = `
    <p style="margin:0 0 14px 0;line-height:1.6;">${escapeHtml(greeting(input.fullName))}</p>
    <p style="margin:0 0 14px 0;line-height:1.6;">
      Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable ${hours} heure${hours > 1 ? 's' : ''} et ne peut être utilisé qu’une seule fois.
    </p>
    <p style="margin:0 0 18px 0;">
      <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:${branding.colorPrimary};color:#FFFFFF;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Choisir un nouveau mot de passe</a>
    </p>
    <p style="margin:0 0 14px 0;line-height:1.6;font-size:13px;color:#6B6480;">
      Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.
    </p>
    <p style="margin:0;line-height:1.6;">${escapeHtml(SIGNATURE)}</p>`;

  const text = `${greeting(input.fullName)}

Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable ${hours} heure${hours > 1 ? 's' : ''} et ne peut être utilisé qu'une seule fois :

${input.resetUrl}

Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.

${SIGNATURE}
${branding.churchName}`;

  return {
    subject,
    text,
    html: renderLayout({ branding, title: 'Réinitialisation de votre mot de passe', bodyHtml }),
  };
}

/** Demande d'adhesion approuvee. */
export function membershipApprovedEmail(
  branding: BrandingContext,
  input: { loginUrl: string } & MemberGreeting,
): RenderedEmail {
  const subject = `Votre adhésion est validée — ${branding.churchName}`;
  const bodyHtml = `
    <p style="margin:0 0 14px 0;line-height:1.6;">${escapeHtml(greeting(input.fullName))}</p>
    <p style="margin:0 0 14px 0;line-height:1.6;">
      Votre demande d’adhésion a été examinée et <strong>acceptée</strong>. Vous avez désormais accès à l’espace membre : annuaire de la communauté, annonces, galerie réservée, événements et départements.
    </p>
    <p style="margin:0 0 18px 0;">
      <a href="${escapeHtml(input.loginUrl)}" style="display:inline-block;background:${branding.colorPrimary};color:#FFFFFF;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Accéder à mon espace</a>
    </p>
    <p style="margin:0;line-height:1.6;">${escapeHtml(SIGNATURE)}</p>`;

  const text = `${greeting(input.fullName)}

Votre demande d'adhésion a été examinée et acceptée. Vous avez désormais accès à l'espace membre.

${input.loginUrl}

${SIGNATURE}
${branding.churchName}`;

  return {
    subject,
    text,
    html: renderLayout({ branding, title: 'Votre adhésion est validée', bodyHtml }),
  };
}

/** Demande d'adhesion refusee. */
export function membershipRejectedEmail(
  branding: BrandingContext,
  input: { note?: string | null } & MemberGreeting,
): RenderedEmail {
  const subject = `Suite donnée à votre demande d’adhésion — ${branding.churchName}`;
  const noteText = input.note?.trim();
  const bodyHtml = `
    <p style="margin:0 0 14px 0;line-height:1.6;">${escapeHtml(greeting(input.fullName))}</p>
    <p style="margin:0 0 14px 0;line-height:1.6;">
      Après examen, votre demande d’adhésion n’a pas été retenue à ce stade.
    </p>
    ${noteText ? `<p style="margin:0 0 14px 0;padding:12px 14px;background:#FAF9FD;border-left:3px solid ${branding.colorAccent};line-height:1.6;">${textToHtmlParagraphs(noteText)}</p>` : ''}
    <p style="margin:0 0 14px 0;line-height:1.6;">
      Si vous pensez qu’il s’agit d’une erreur, vous pouvez nous répondre directement à cet e-mail.
    </p>
    <p style="margin:0;line-height:1.6;">${escapeHtml(SIGNATURE)}</p>`;

  const text = `${greeting(input.fullName)}

Après examen, votre demande d'adhésion n'a pas été retenue à ce stade.
${noteText ? `\nObservation : ${noteText}\n` : ''}
Si vous pensez qu'il s'agit d'une erreur, vous pouvez nous répondre directement à cet e-mail.

${SIGNATURE}
${branding.churchName}`;

  return {
    subject,
    text,
    html: renderLayout({ branding, title: 'Suite donnée à votre demande', bodyHtml }),
  };
}

/** Nomination dans un departement (information du membre concerne). */
export function nominationEmail(
  branding: BrandingContext,
  input: {
    departmentName: string;
    roleLabel: string;
    functionTitle?: string | null;
    startedOn?: string | null;
  } & MemberGreeting,
): RenderedEmail {
  const functionLabel = input.functionTitle?.trim() || input.roleLabel;
  const subject = `Votre nomination — ${input.departmentName}`;
  const bodyHtml = `
    <p style="margin:0 0 14px 0;line-height:1.6;">${escapeHtml(greeting(input.fullName))}</p>
    <p style="margin:0 0 14px 0;line-height:1.6;">
      Vous avez été nommé(e) au sein du département <strong>${escapeHtml(input.departmentName)}</strong> avec la fonction de <strong>${escapeHtml(functionLabel)}</strong>${input.startedOn ? ` à compter du ${escapeHtml(input.startedOn)}` : ''}.
    </p>
    <p style="margin:0 0 14px 0;line-height:1.6;">
      Votre espace membre affiche désormais les outils correspondants. Merci pour votre engagement.
    </p>
    <p style="margin:0;line-height:1.6;">${escapeHtml(SIGNATURE)}</p>`;

  const text = `${greeting(input.fullName)}

Vous avez été nommé(e) au sein du département ${input.departmentName} avec la fonction de ${functionLabel}${input.startedOn ? ` à compter du ${input.startedOn}` : ''}.

Merci pour votre engagement.

${SIGNATURE}
${branding.churchName}`;

  return {
    subject,
    text,
    html: renderLayout({ branding, title: 'Votre nomination', bodyHtml }),
  };
}

/** Message d'information libre redige par un administrateur. */
export function broadcastEmail(
  branding: BrandingContext,
  input: {
    subject: string;
    body: string;
    unsubscribeUrl?: string | null;
    authorName?: string | null;
  } & MemberGreeting,
): RenderedEmail {
  const bodyHtml = `
    <p style="margin:0 0 14px 0;line-height:1.6;">${escapeHtml(greeting(input.fullName))}</p>
    ${textToHtmlParagraphs(input.body)}
    <p style="margin:18px 0 0 0;line-height:1.6;">${escapeHtml(SIGNATURE)}</p>
    ${input.authorName ? `<p style="margin:6px 0 0 0;font-size:13px;color:#6B6480;">${escapeHtml(input.authorName)}, ${escapeHtml(branding.churchName)}</p>` : ''}`;

  const text = `${greeting(input.fullName)}

${input.body.trim()}

${SIGNATURE}
${input.authorName ? `${input.authorName}, ` : ''}${branding.churchName}`;

  return {
    subject: input.subject,
    text,
    html: renderLayout({
      branding,
      title: input.subject,
      bodyHtml,
      unsubscribeUrl: input.unsubscribeUrl ?? null,
      footnote: 'Message d’information envoyé depuis votre espace membre.',
    }),
  };
}

/** Message de verification de la configuration SMTP. */
export function testEmail(branding: BrandingContext, input: { sentAt: string }): RenderedEmail {
  const subject = `Test d’envoi — ${branding.churchName}`;
  const bodyHtml = `
    <p style="margin:0 0 14px 0;line-height:1.6;">
      Ce message confirme que la configuration d’envoi des e-mails fonctionne depuis ${escapeHtml(branding.churchName)}.
    </p>
    <p style="margin:0 0 14px 0;line-height:1.6;font-size:13px;color:#6B6480;">Envoyé le ${escapeHtml(input.sentAt)}.</p>
    <p style="margin:0;line-height:1.6;">${escapeHtml(SIGNATURE)}</p>`;

  const text = `Ce message confirme que la configuration d'envoi des e-mails fonctionne depuis ${branding.churchName}.

Envoyé le ${input.sentAt}.

${SIGNATURE}`;

  return {
    subject,
    text,
    html: renderLayout({ branding, title: 'Test d’envoi réussi', bodyHtml }),
  };
}
