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

### La méthode rapide (recommandée)

```bash
npm run setup
```

Cette commande crée `backend/.env` à partir de `backend/.env.example`, y écrit
un `SESSION_SECRET` aléatoire (48 octets) et règle les valeurs de
développement (`PORT=4000`, `FRONTEND_URL=http://localhost:3000`).

Elle est **sans danger à relancer** : si `backend/.env` existe déjà, elle ne
touche à aucune de vos valeurs, sauf si `SESSION_SECRET` est absent ou resté à
la valeur d'exemple.

> **PowerShell** : la commande est identique. N'utilisez pas `cp` (alias de
> `Copy-Item`, mais la syntaxe varie selon la version) : `npm run setup` est
> portable et fonctionne aussi sous Windows.

### La méthode manuelle

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

### Spécificités Windows

- **Installez toujours à la racine.** Un `npm install` lancé dans `frontend/`
  crée un second `package-lock.json` et un `node_modules` incomplet : c'est une
  source classique de pages vides et de modules « introuvables ».
- **`TAR_ENTRY_ERROR`** pendant l'installation = fichiers verrouillés par
  l'antivirus ou par la synchronisation OneDrive. Placez le projet dans un
  dossier non synchronisé (par exemple `C:\dev\Eglise`), puis relancez
  `npm install`.
- **`localhost` et IPv6.** Depuis Node 18, `localhost` peut être résolu en
  `::1` alors que l'API écoute en IPv4. Le proxy de Vite vise désormais
  explicitement `127.0.0.1:4000` : plus d'`ECONNREFUSED` alors que le serveur
  tourne.

## 8. « Les pages ne chargent pas » — la cause n°1

```text
[vite] http proxy error: /api/v1/public/settings
AggregateError [ECONNREFUSED]
```

**Traduction : l'interface tourne, mais l'API est arrêtée.** Le site s'affiche,
puis chaque page reste vide : elle attend des données que personne ne lui envoie.

Lancer `npm run dev` **dans `frontend/`** ne démarre que l'interface (Vite).
Deux serveurs sont nécessaires : l'interface (port 3000) **et** l'API (port 4000).

```bash
# depuis la RACINE du projet — les deux serveurs, un seul terminal
npm run dev
```

Ou deux terminaux, en gardant le premier ouvert :

```bash
npm run dev:backend    # terminal 1 : API, port 4000
npm run dev:frontend   # terminal 2 : interface, port 3000
```

**Vérification en une commande** (depuis la racine) :

```bash
npm run doctor
```

Le diagnostic contrôle Node, les dépendances, `backend/.env`, la base, puis la
joignabilité de l'API et de l'interface, et indique la solution pour chaque
point en échec. S'il affiche « L'interface fonctionne mais l'API est arrêtée »,
lancez simplement `npm run dev` dans un second terminal.

Depuis la version actuelle, Vite n'affiche plus cette erreur des dizaines de
fois : un message unique et lisible la remplace, avec la marche à suivre.

## 9. « Configuration invalide … SESSION_SECRET: expected string, received undefined »

Message complet :

```
Error: Configuration invalide. Corrigez backend/.env :
  - SESSION_SECRET: Invalid input: expected string, received undefined
```

**Cause** : `backend/.env` n'existe pas (ou existe sans `SESSION_SECRET`).
Ce n'est pas un bug : ce fichier contient vos secrets, donc il n'est **pas**
versionné sur GitHub. Il doit être créé une fois sur chaque machine.

**Solution** :

```powershell
npm run setup
```

Puis relancez la commande qui a échoué, par exemple :

```powershell
npm run init-super-admin -- --email joannegnava@gmail.com
```

Le message d'erreur de l'API indique désormais cette marche à suivre ; si vous
préférez comprendre l'état de votre installation, `npm run doctor` détaille
chaque point de contrôle.

## 10. Problèmes courants

| Symptôme | Cause | Solution |
|---|---|---|
| `Impossible de localiser le module …` dans l'éditeur | dépendances absentes | `npm install` **à la racine**, puis recharger la fenêtre VS Code |
| Erreurs d'import fantômes après une mise à jour | serveur TypeScript de VS Code | `TypeScript: Restart TS Server` |
| `EADDRINUSE :4000` | une instance de l'API tourne déjà | fermer l'ancien processus, ou changer `PORT` |
| `http proxy error … ECONNREFUSED` | API arrêtée | `npm run dev` à la racine, puis `npm run doctor` |
| `TAR_ENTRY_ERROR UNKNOWN: unknown error, open …` (Windows) | antivirus, OneDrive ou dossier synchronisé verrouille les fichiers pendant l'installation | mettre le projet hors d'un dossier synchronisé (ex. `C:\dev\Eglise`), suspendre l'antivirus le temps de l'installation, puis relancer `npm install` à la racine |
| installation très lente ou incomplète (Windows) | `node_modules` dans `frontend/` ou `backend/` | supprimer ce `node_modules` et son `package-lock.json`, puis `npm install` **à la racine** |
| `[seed] comptes déjà présents` | base déjà initialisée | `SEED_DEMO_PASSWORD=…` puis `db:seed -- --force`, ou `db:reset` |
| Connexion impossible avec un compte seedé | mot de passe d'un seed antérieur | voir ci-dessus |
| Les e-mails ne partent pas | `MAIL_DRIVER=log` | passer à `smtp` et renseigner `SMTP_*` |
