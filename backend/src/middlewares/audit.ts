import type { Queryable } from '../db/client.js';
import { logger } from '../utils/logger.js';

export interface AuditEntry {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/** Journalise une action administrative ou sensible. Ne doit jamais bloquer l'action. */
export async function recordAudit(db: Queryable, entry: AuditEntry): Promise<void> {
  try {
    await db.query(
      `insert into public.audit_logs
         (actor_id, actor_email, action, entity_type, entity_id, metadata, ip)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.actorId ?? null,
        entry.actorEmail ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        JSON.stringify(entry.metadata ?? {}),
        entry.ip ?? null,
      ],
    );
  } catch (error) {
    logger.error("[audit] echec d'ecriture du journal", error);
  }
}

export function clientIp(ip: string | undefined): string | undefined {
  return ip?.replace(/^::ffff:/, '');
}
