import nodemailer, { type Transporter } from 'nodemailer';
import { env, isProduction, isTest } from '../../config/env.js';

/**
 * Transport d'envoi des e-mails.
 *
 * Trois modes, choisis par `MAIL_DRIVER` :
 *   - `smtp` : envoi reel. Compatible avec tout fournisseur exposant SMTP
 *     (serveur de l'eglise, Brevo, Mailgun, OVH, Gmail professionnel…) ;
 *   - `log`  : le message est ecrit dans les journaux et la file le considere
 *     comme envoye. Mode par defaut en developpement et en test ;
 *   - `off`  : rien n'est envoye, la file conserve les messages en attente.
 *
 * L'interface `MailTransport` isole le reste du code du fournisseur : changer de
 * prestataire ne demande aucune modification des services metier.
 */

export interface OutgoingMessage {
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html: string;
  /** Adresse de reponse eventuelle (par defaut `MAIL_REPLY_TO`). */
  replyTo?: string | null;
}

export interface SendResult {
  /** Identifiant fournisseur, utile pour tracer un envoi aupres du prestataire. */
  messageId: string | null;
}

export interface MailTransport {
  readonly name: 'smtp' | 'log' | 'off' | 'memory';
  send(message: OutgoingMessage): Promise<SendResult>;
  /** Ferme les connexions ouvertes (appele a l'arret du serveur). */
  close(): Promise<void>;
}

/** Adresse complete de l'expediteur, au format `Nom <adresse>`. */
export function formatFromAddress(): string {
  const name = env.MAIL_FROM_NAME?.trim();
  return name ? `"${name.replace(/"/g, '')}" <${env.MAIL_FROM_ADDRESS}>` : env.MAIL_FROM_ADDRESS;
}

class SmtpTransport implements MailTransport {
  readonly name = 'smtp' as const;
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // 465 = TLS implicite ; 587 = STARTTLS negocie automatiquement.
      secure: env.SMTP_SECURE,
      auth:
        env.SMTP_USER && env.SMTP_PASSWORD
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
      // Un serveur lent ne doit pas bloquer indefiniment un traitement.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    return this.transporter;
  }

  async send(message: OutgoingMessage): Promise<SendResult> {
    const info = await this.getTransporter().sendMail({
      from: formatFromAddress(),
      to: message.toName ? `"${message.toName.replace(/"/g, '')}" <${message.to}>` : message.to,
      replyTo: message.replyTo ?? env.MAIL_REPLY_TO ?? undefined,
      subject: message.subject,
      text: message.text,
      html: message.html,
      // En-tete standard pour eviter les reponses automatiques en boucle.
      headers: { 'Auto-Submitted': 'auto-generated' },
    });
    return { messageId: info.messageId ?? null };
  }

  async close(): Promise<void> {
    this.transporter?.close();
    this.transporter = null;
  }
}

/**
 * Transport de developpement : trace un resume du message sans rien envoyer.
 * Le corps n'est pas journalise en entier pour ne pas laisser de donnees
 * personnelles dans les journaux d'exploitation.
 */
class LogTransport implements MailTransport {
  readonly name = 'log' as const;

  async send(message: OutgoingMessage): Promise<SendResult> {
    const id = `log-${Date.now()}`;
    console.log(
      `[mail] (mode log) a=${message.to} sujet="${message.subject}" taille=${message.text.length}o id=${id}`,
    );
    return { messageId: id };
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

/** Mode `off` : aucun envoi. La file garde les messages pour plus tard. */
class OffTransport implements MailTransport {
  readonly name = 'off' as const;

  async send(): Promise<SendResult> {
    throw new Error('Envoi desactive (MAIL_DRIVER=off).');
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Transport memoire, utilise uniquement par les tests automatiques.
 * Il permet de verifier le contenu exact des messages sans reseau.
 */
export class MemoryTransport implements MailTransport {
  readonly name = 'memory' as const;
  readonly sent: OutgoingMessage[] = [];
  /** Simule une panne du fournisseur pour tester les nouvelles tentatives. */
  failNext = 0;

  async send(message: OutgoingMessage): Promise<SendResult> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('Panne simulee du fournisseur SMTP.');
    }
    this.sent.push(message);
    return { messageId: `memory-${this.sent.length}` };
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

let transport: MailTransport | null = null;
let testTransport: MemoryTransport | null = null;

/**
 * Transport actif. En test, un transport memoire est utilise pour que les
 * scenarios puissent inspecter les messages reellement produits.
 */
export function getMailTransport(): MailTransport {
  if (isTest) {
    testTransport ??= new MemoryTransport();
    return testTransport;
  }
  if (transport) return transport;
  if (env.MAIL_DRIVER === 'smtp') transport = new SmtpTransport();
  else if (env.MAIL_DRIVER === 'off') transport = new OffTransport();
  else transport = new LogTransport();
  return transport;
}

/** Remplace le transport (tests, outils de diagnostic). */
export function setMailTransport(next: MailTransport | null): void {
  transport = next;
  if (next instanceof MemoryTransport) testTransport = next;
}

export async function closeMailTransport(): Promise<void> {
  await transport?.close();
  transport = null;
}

/** Vrai si un envoi reel est possible avec la configuration actuelle. */
export function isMailConfigured(): boolean {
  if (isTest) return true;
  if (env.MAIL_DRIVER === 'smtp') return Boolean(env.SMTP_HOST);
  return env.MAIL_DRIVER === 'log';
}

/** Resume lisible de la configuration, sans jamais exposer de secret. */
export function mailPublicConfig() {
  return {
    driver: isTest ? 'memory' : env.MAIL_DRIVER,
    configured: isMailConfigured(),
    fromAddress: env.MAIL_FROM_ADDRESS,
    fromName: env.MAIL_FROM_NAME ?? null,
    replyTo: env.MAIL_REPLY_TO ?? null,
    host: env.MAIL_DRIVER === 'smtp' ? (env.SMTP_HOST ?? null) : null,
    port: env.MAIL_DRIVER === 'smtp' ? env.SMTP_PORT : null,
    workerEnabled: env.MAIL_WORKER_ENABLED && !isTest,
    // Un mode non-SMTP en production est une erreur d'exploitation a signaler.
    warning:
      isProduction && env.MAIL_DRIVER !== 'smtp'
        ? 'Aucun envoi reel : MAIL_DRIVER est different de « smtp ». Les e-mails ne quitteront pas le serveur.'
        : null,
  };
}
