# Démarrage rapide

## 1. Prérequis

- **Node.js 22** (voir `.nvmrc`) ;
- npm 10 ou plus récent ;
- aucun PostgreSQL à installer : en développement l'API utilise **PGlite**
  (PostgreSQL embarqué, données dans `backend/var/pglite`).

## 2. Installation — à faire **une fois**, depuis la racine du dépôt

```bash
npm install
```

Ce dépôt est un **monorepo** (workspaces npm : `backend` et `frontend`).
`npm install` à la racine installe les dépendances des deux applications dans
un unique dossier `node_modules/` à la racine. Il ne faut donc **pas** lancer
`npm install` dans `frontend/` ou `backend/` séparément : npm n'y trouverait pas
les dépendances croisées.

> Sans cette commande, l'éditeur affiche des erreurs du type
> `Impossible de localiser le module '@tanstack/react-query'`,
> `'motion/react'`, `'sonner'`, `'react/jsx-runtime'` ou
> `Le fichier de définition de type est introuvable pour 'vitest/globals'`.
> **Ce ne sont pas des erreurs de code** : les paquets ne sont simplement pas
> encore présents sur la machine. Relancer `npm install` les fait disparaître.

## 3. Configuration de l'API

```bash
cp backend/.env.example backend/.env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # → SESSION_SECRET
```

Dans `backend/.env` :

| Variable | Valeur en développement |
|---|---|
| `PORT` | `4000` (l'interface occupe 3000) |
| `SESSION_SECRET` | la valeur aléatoire générée ci-dessus |
| `FRONTEND_URL` | `http://localhost:3000` |
| `SEED_DEMO_DATA` | `true` pour avoir le contenu de démonstration |
| `MAIL_DRIVER` | `log` (les e-mails sont écrits dans les journaux, pas envoyés) |

`backend/.env` est ignoré par Git : il ne doit jamais être commité.

## 4. Base de données

```bash
npm run db:migrate    # applique les 7 migrations
npm run db:seed       # contenu de démonstration (si SEED_DEMO_DATA=true)
```

Le seed n'affiche le mot de passe commun que s'il vient de créer les comptes.
S'il indique « comptes déjà présents », les mots de passe existants n'ont pas
changé : pour en fixer un connu, utilisez `SEED_DEMO_PASSWORD` ou
`npm run db:reset` (destructif, local uniquement).

## 5. Créer le compte administrateur

```bash
npm run init-super-admin -- --email vous@exemple.ci
```

Le mot de passe est demandé à l'invite **masquée**. Il n'est jamais accepté en
argument de commande (il resterait dans l'historique du shell). Voir
[`INITIALISATION_ADMIN.md`](INITIALISATION_ADMIN.md).

## 6. Lancer

```bash
npm run dev     # interface http://localhost:3000 · API http://localhost:4000
```

L'interface appelle l'API en relatif (`/api/v1/...`) : le proxy de Vite
redirige vers le port 4000. Ouvrez ensuite <http://localhost:3000>.

Contrôle rapide : <http://localhost:4000/api/v1/health> doit répondre
`{"status":"ok","database":"pglite","storage":"local"}`.

## 7. Ouvrir le projet dans VS Code

- Ouvrez **la racine du dépôt** (`Eglise/`), pas `frontend/` seul : c'est là que
  se trouvent `node_modules/`, les scripts npm et la configuration TypeScript.
- Le dossier `.vscode/` fourni impose le TypeScript du projet
  (`node_modules/typescript`). Si VS Code demande « Utiliser la version de
  TypeScript de l'espace de travail ? », répondez **Oui** ; sinon, exécutez
  `TypeScript: Select TypeScript Version` → `Use Workspace Version`.
- Vérifications identiques à l'intégration continue :

```bash
npm run typecheck    # backend + frontend
npm run lint         # même contrôle, via les scripts des workspaces
npm run test         # backend + frontend
npm run build
```

## 8. Problèmes courants

| Symptôme | Cause | Solution |
|---|---|---|
| `Impossible de localiser le module …` dans l'éditeur | dépendances absentes | `npm install` **à la racine**, puis recharger la fenêtre VS Code |
| Erreurs d'import fantômes après une mise à jour | serveur TypeScript de VS Code | `TypeScript: Restart TS Server` |
| `EADDRINUSE :4000` | une instance de l'API tourne déjà | fermer l'ancien processus, ou changer `PORT` |
| `[seed] comptes déjà présents` | base déjà initialisée | `SEED_DEMO_PASSWORD=…` puis `db:seed -- --force`, ou `db:reset` |
| Connexion impossible avec un compte seedé | mot de passe d'un seed antérieur | voir ci-dessus |
| Les e-mails ne partent pas | `MAIL_DRIVER=log` | passer à `smtp` et renseigner `SMTP_*` |
