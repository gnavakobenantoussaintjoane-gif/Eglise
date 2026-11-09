#!/usr/bin/env node
/**
 * Diagnostic de l'environnement de développement.
 *
 * Objectif : quand « les pages ne chargent pas », la cause est presque toujours
 * l'une des cinq situations ci-dessous. Ce script les verifie dans l'ordre et
 * affiche une solution concrete pour chacune.
 *
 * Utilisation : npm run doctor   (depuis la racine du projet)
 * Aucune dependance externe : fonctionne sur Windows, macOS et Linux.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const API = process.env.DOCTOR_API_URL ?? 'http://127.0.0.1:4000/api/v1/health';
const WEB = process.env.DOCTOR_WEB_URL ?? 'http://127.0.0.1:3000/';

const results = [];
function check(label, ok, detail, solution) {
  results.push({ label, ok, detail, solution });
}

/** Requete HTTP avec delai maximal : ne bloque jamais le diagnostic. */
async function probe(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { reachable: true, status: response.status };
  } catch {
    return { reachable: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

// 1. Version de Node -------------------------------------------------------
const major = Number(process.versions.node.split('.')[0]);
check(
  `Node.js ${process.versions.node}`,
  major >= 22,
  major >= 22 ? 'version compatible' : 'Node 22 ou plus est requis',
  'Installez Node 22 : https://nodejs.org (ou utilisez nvm).',
);

// 2. Dependances installees a la RACINE -----------------------------------
const rootModules = existsSync(join(root, 'node_modules'));
check(
  'Dependances (racine)',
  rootModules,
  rootModules ? 'node_modules present a la racine' : 'node_modules absent a la racine',
  'Lancez « npm install » A LA RACINE du projet (pas dans frontend/ ni backend/).',
);

// Detecte l'erreur classique : un `npm install` lance DANS frontend/ ou backend/.
// Un node_modules imbrique est normal dans un monorepo (npm y place les paquets
// qui ne peuvent pas etre remontes) : le vrai indice est le fichier
// package-lock.json, que npm cree a chaque installation locale.
const wrongInstalls = ['frontend', 'backend'].filter((dir) =>
  existsSync(join(root, dir, 'package-lock.json')),
);
if (wrongInstalls.length > 0) {
  check(
    'Installation dans un sous-dossier',
    false,
    `package-lock.json trouve dans : ${wrongInstalls.join(', ')}`,
    'Monorepo : supprimez ce package-lock.json et le node_modules du sous-dossier, puis lancez npm install a la RACINE.',
  );
}

// 3. Fichier de configuration de l'API ------------------------------------
const envPath = join(root, 'backend', '.env');
const hasEnv = existsSync(envPath);
check(
  'backend/.env',
  hasEnv,
  hasEnv ? 'fichier de configuration present' : 'fichier absent : l\'API refusera de demarrer',
  'Lancez « npm run setup » a la racine : le fichier est cree avec un SESSION_SECRET aleatoire.',
);

if (hasEnv) {
  const content = readFileSync(envPath, 'utf8');
  const secret = /^SESSION_SECRET=(.*)$/m.exec(content)?.[1]?.trim() ?? '';
  check(
    'SESSION_SECRET',
    secret.length >= 32 && !/change_me|example|placeholder/i.test(secret),
    secret.length >= 32 ? `defini (${secret.length} caracteres)` : 'absent, trop court ou valeur d\'exemple',
    'Lancez « npm run setup » : la valeur manquante ou d\'exemple est remplacee automatiquement.',
  );
}

// 4. Base de donnees locale ----------------------------------------------
const pglite = existsSync(join(root, 'backend', 'var', 'pglite'));
check(
  'Base de donnees locale',
  pglite,
  pglite ? 'PGlite initialise (backend/var/pglite)' : 'base non initialisee',
  'Lancez « npm run db:migrate » puis « npm run db:seed ».',
);

// 5. API joignable --------------------------------------------------------
const api = await probe(API);
check(
  'API (port 4000)',
  api.reachable && api.status === 200,
  api.reachable ? `repond ${api.status} sur ${API}` : `injoignable sur ${API}`,
  'Lancez l\'API : « npm run dev:backend », ou les deux serveurs avec « npm run dev » a la racine.',
);

// 6. Interface joignable --------------------------------------------------
const web = await probe(WEB);
check(
  'Interface (port 3000)',
  web.reachable,
  web.reachable ? `repond ${web.status} sur ${WEB}` : `injoignable sur ${WEB}`,
  'Lancez l\'interface : « npm run dev:frontend », ou les deux serveurs avec « npm run dev ».',
);

// --- Rapport -------------------------------------------------------------
const line = '─'.repeat(68);
// Largeur commune pour que les colonnes restent alignees quel que soit le label.
const width = Math.max(...results.map((result) => result.label.length)) + 2;

console.log(`\n${line}\n  Diagnostic — La Forteresse de l'Éternel\n${line}\n`);

for (const result of results) {
  console.log(`  ${result.ok ? '✓' : '✗'} ${result.label.padEnd(width)} ${result.detail}`);
  if (!result.ok && result.solution) console.log(`      → ${result.solution}`);
}

const failures = results.filter((result) => !result.ok);
console.log(`\n${line}`);

if (failures.length === 0) {
  console.log('  Tout est en ordre : ouvrez http://localhost:3000\n');
} else {
  const apiOk = results.find((result) => result.label.startsWith('API'));
  const webOk = results.find((result) => result.label.startsWith('Interface'));
  console.log(`  ${failures.length} point(s) a corriger.`);
  // Cas le plus frequent : l'interface tourne, l'API non.
  if (webOk?.ok && !apiOk?.ok) {
    console.log('\n  L\'interface fonctionne mais l\'API est arretee : les pages');
    console.log('  s\'affichent sans contenu. Dans un terminal, a la RACINE :');
    console.log('\n      npm run dev');
    console.log('\n  (ou « npm run dev:backend » si l\'interface tourne deja)');
  }
  console.log('');
}

// Un diagnostic en echec doit etre visible dans un script automatise.
process.exitCode = failures.length === 0 ? 0 : 1;
