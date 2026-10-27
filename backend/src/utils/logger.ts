import { env, isTest } from '../config/env.js';

/**
 * Journalisation minimale et unique du serveur.
 *
 * Objectif : que `LOG_LEVEL` (documente dans le README et DEPLOIEMENT.md) ait
 * un effet reel au lieu d'etre une variable decorative.
 *
 * Regles :
 *   - `debug` est silencieux par defaut en production (niveau `info`) ;
 *   - les messages de niveau inferieur au seuil ne sont pas ecrits du tout ;
 *   - les sorties restent sur `console`, donc exploitables telles quelles par
 *     Docker, systemd, Render, etc. sans dependance supplementaire ;
 *   - l'horodatage est ISO pour faciliter la correlation avec un reverse proxy.
 *
 * Les scripts en ligne de commande (dossier `scripts/`) continuent d'utiliser
 * `console` directement : leur but est de parler a l'operateur, pas de
 * respecter le niveau de journalisation de l'API.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** En test, seules les erreurs sont emises : la sortie reste lisible. */
const threshold: Level = isTest ? 'error' : env.LOG_LEVEL;

function enabled(level: Level): boolean {
  return ORDER[level] >= ORDER[threshold];
}

/**
 * Met en forme le premier argument. Une `Error` conserve sa pile : sans cela,
 * `logger.error(error)` afficherait seulement « Error: ... » et perdrait le
 * point de depart de l'incident.
 */
function format(message: unknown): string {
  if (message instanceof Error) return message.stack ?? `${message.name}: ${message.message}`;
  return String(message);
}

function write(level: Level, message: unknown, context?: unknown): void {
  if (!enabled(level)) return;
  const line = `${new Date().toISOString()} [${level}] ${format(message)}`;
  if (context === undefined) {
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }
  if (level === 'error') console.error(line, context);
  else if (level === 'warn') console.warn(line, context);
  else console.log(line, context);
}

export const logger = {
  level: threshold,
  enabled,
  debug: (message: unknown, context?: unknown) => write('debug', message, context),
  info: (message: unknown, context?: unknown) => write('info', message, context),
  warn: (message: unknown, context?: unknown) => write('warn', message, context),
  error: (message: unknown, context?: unknown) => write('error', message, context),
};
