#!/usr/bin/env node
/**
 * Création guidée de `backend/.env`.
 *
 * Pourquoi ce script : sans `backend/.env`, l'API refuse de démarrer avec
 * « Configuration invalide … SESSION_SECRET: expected string, received
 * undefined ». La cause n'est pas un bug mais un fichier de configuration
 * absent — et il est volontairement absent du dépôt, puisqu'il contient des
 * secrets.
 *
 * Ce script fait donc le seul travail répétable à la main :
 *   1. copier `backend/.env.example` vers `backend/.env` ;
 *   2. y écrire un `SESSION_SECRET` aléatoire (48 octets, base64url) ;
 *   3. régler les valeurs de développement (PORT=4000, interface 3000).
 *
 * Il est IDEMPOTENT : si `backend/.env` existe déjà, il ne touche à rien,
 * sauf si `SESSION_SECRET` est absent ou resté à la valeur d'exemple — dans ce
 * cas il corrige uniquement cette ligne. Aucune autre valeur n'est écrasée,
 * donc une configuration personnalisée (Supabase, SMTP) est préservée.
 *
 * Usage :
 *   npm run setup
 *   npm run setup -- --show   # indique aussi les valeurs sensibles masquées
 */

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const examplePath = path.join(root, 'backend', '.env.example');
const envPath = path.join(root, 'backend', '.env');

const PLACEHOLDER = /change_me|example|placeholder|^$/i;

/** 48 octets aléatoires : largement au-dessus du minimum de 32 caractères. */
function generateSecret() {
  return randomBytes(48).toString('base64url');
}

/** Remplace (ou ajoute) une clé dans un contenu .env, sans toucher au reste. */
function setKey(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, line);
  const trimmed = content.endsWith('\n') ? content : `${content}\n`;
  return `${trimmed}${line}\n`;
}

/** Lit la valeur courante d'une clé (sans dotenv : une simple ligne suffit). */
function getKey(content, key) {
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(content);
  return match ? match[1].trim() : '';
}

function fail(message, hint) {
  console.error(`\n  ✗ ${message}`);
  if (hint) console.error(`    ${hint}`);
  console.error('');
  process.exit(1);
}

function main() {
  const showSecrets = process.argv.includes('--show');

  if (!existsSync(examplePath)) {
    fail(
      'backend/.env.example est introuvable.',
      'Le fichier fait partie du dépôt : vérifiez que vous êtes bien dans le dossier du projet.',
    );
  }

  const template = readFileSync(examplePath, 'utf8');
  const exists = existsSync(envPath);
  let content = exists ? readFileSync(envPath, 'utf8') : template;
  const actions = [];

  // 1. Le secret de session : obligatoire, jamais fourni par défaut.
  const currentSecret = getKey(content, 'SESSION_SECRET');
  if (!currentSecret || PLACEHOLDER.test(currentSecret) || currentSecret.length < 32) {
    content = setKey(content, 'SESSION_SECRET', generateSecret());
    actions.push(
      currentSecret
        ? 'SESSION_SECRET remplacé (absent, trop court ou laissé à la valeur d\'exemple)'
        : 'SESSION_SECRET généré (48 octets aléatoires)',
    );
  }

  // 2. Valeurs de développement, uniquement à la création du fichier : sur un
  //    fichier existant, l'utilisateur a pu choisir d'autres valeurs.
  if (!exists) {
    content = setKey(content, 'NODE_ENV', 'development');
    content = setKey(content, 'PORT', '4000');
    content = setKey(content, 'FRONTEND_URL', 'http://localhost:3000');
    content = setKey(content, 'SEED_DEMO_DATA', 'true');
    content = setKey(content, 'MAIL_DRIVER', 'log');
    actions.push('fichier créé à partir de backend/.env.example');
  }

  if (actions.length > 0) {
    writeFileSync(envPath, content, { encoding: 'utf8', mode: 0o600 });
  }

  const secret = getKey(content, 'SESSION_SECRET');
  const port = getKey(content, 'PORT') || '3000';
  const frontendUrl = getKey(content, 'FRONTEND_URL') || '(non défini)';

  console.log('');
  console.log('  Configuration de l\'API');
  console.log('  ' + '-'.repeat(58));
  console.log(`  ✓ backend/.env ${exists ? 'présent' : 'créé'}`);
  if (actions.length === 0) {
    console.log('  ✓ SESSION_SECRET déjà configuré (inchangé)');
  } else {
    for (const action of actions) console.log(`  ✓ ${action}`);
  }
  console.log(`  · port de l'API        : ${port}`);
  console.log(`  · interface autorisée  : ${frontendUrl}`);
  if (showSecrets) {
    const masked = `${secret.slice(0, 4)}…${secret.slice(-4)} (${secret.length} caractères)`;
    console.log(`  · SESSION_SECRET       : ${masked}`);
  }

  const needsPortFix = port === '3000';
  console.log('');
  if (needsPortFix) {
    console.log('  Attention : PORT=3000 entre en conflit avec l\'interface en développement.');
    console.log('  Mettez PORT=4000 dans backend/.env (le proxy de Vite pointe sur 4000).');
    console.log('');
  }
  console.log('  Étapes suivantes :');
  console.log('    npm run db:migrate                     # crée les tables');
  console.log('    npm run db:seed                        # contenu de démonstration');
  console.log('    npm run init-super-admin -- --email vous@exemple.ci');
  console.log('    npm run dev                            # API + interface');
  console.log('');
  console.log('  backend/.env est ignoré par Git : vos secrets ne partent jamais sur GitHub.');
  console.log('');
}

main();
