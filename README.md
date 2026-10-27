# La Forteresse de l'Éternel

[![CI](https://github.com/gnavakobenantoussaintjoane-gif/Eglise/actions/workflows/ci.yml/badge.svg)](https://github.com/gnavakobenantoussaintjoane-gif/Eglise/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-47%20%2817%20API%20%2B%2030%20interface%29-brightgreen)](https://github.com/gnavakobenantoussaintjoane-gif/Eglise/actions/workflows/ci.yml)
[![Licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933)](.nvmrc)

Application web complète pour l'église évangélique **La Forteresse de l'Éternel** (Abidjan, Côte d'Ivoire) : site vitrine public, espace membre avec parcours d'adhésion, espace média et back-office d'administration.

Le dépôt contient une **API REST** (Node/Express + TypeScript) et une **interface React**, dans un monorepo npm. Le schéma de base de données est fourni en migrations SQL prêtes pour PostgreSQL/Supabase, avec une base locale **PGlite** intégrée pour développer sans rien installer.

```bash
npm install
cp backend/.env.example backend/.env   # renseigner SESSION_SECRET
npm run db:migrate && npm run db:seed
npm run init-super-admin -- --email vous@exemple.ci   # compte principal (mot de passe saisi masqué)
npm run dev                            # site :3000 · API :4000 (proxifiée)
```

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Stack technique](#stack-technique)
- [Structure du dépôt](#structure-du-dépôt)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Variables d'environnement](#variables-denvironnement)
- [Base de données](#base-de-données)
- [Scripts disponibles](#scripts-disponibles)
- [Comptes de démonstration](#comptes-de-démonstration)
- [Routes du site](#routes-du-site)
- [API](#api)
- [Rôles et permissions](#rôles-et-permissions)
- [Messagerie](#messagerie)
- [Sécurité et vie privée](#sécurité-et-vie-privée)
- [Tests et vérifications](#tests-et-vérifications)
- [Intégration continue](#intégration-continue)
- [Déploiement](#déploiement)
- [Dépannage](#dépannage)
- [Licence](#licence)

---

## Fonctionnalités

### Site public

| Page | Route | Contenu |
|---|---|---|
| Accueil | `/` | Hero, horaires de culte, prochaines prédications et événements, départements, appel à l'action |
| À propos | `/a-propos` | Histoire, vision, mission, valeurs, équipe |
| Prédications | `/predications` | Liste filtrable par série et recherche, page de détail avec lecteur vidéo/audio |
| Événements | `/evenements` | À venir / passés, fiche détaillée, **inscription en ligne** (nom, e-mail, places) |
| Départements | `/departements` | Présentation des équipes, fiche détaillée, demande d'adhésion |
| Galerie | `/galerie` | Albums publics, albums réservés aux membres, lightbox clavier, **signalement de retrait** (droit à l'image) |
| Annonces | `/annonces` | Annonces publiques, épinglées en tête |
| Témoignages | `/temoignages` | Témoignages validés ; dépôt réservé aux membres connectés |
| Prière | `/priere` | Formulaire de demande de prière (confidentiel) |
| Contact | `/contact` | Coordonnées, horaires, plan Google Maps, WhatsApp, réseaux sociaux |
| Confidentialité | `/confidentialite` | Politique de confidentialité et de traitement des données |

### Espace membre

Nécessite un compte **approuvé** par un administrateur.

- **Parcours d'adhésion** (`/mon-inscription`) : complétion du profil, envoi de la demande, suivi de l'historique des décisions (profil incomplet → en attente → approuvé / refusé / suspendu).
- **Tableau de bord** : prochains événements, annonces, notifications, état de l'adhésion.
- **Profil** : informations personnelles, photo (upload), changement de mot de passe.
- **Départements** : consulter les équipes, envoyer une demande d'adhésion, annuler une demande en attente.
- **Annonces** et **notifications** internes (marquage lu / tout marquer comme lu).
- **Galerie privée** : albums réservés aux membres et aux personnes autorisées.
- **Événements** : inscription aux rendez-vous de l'église.
- **Témoignages** : rédaction et suivi de modération.

Le membre peut modifier sa **préférence de réception des e-mails d'information** depuis
« Mon profil » ; les messages indispensables au compte (réinitialisation du mot de
passe, décision d'adhésion) continuent de lui être adressés.

### Espace média (`/media`)

Réservé aux administrateurs et à l'équipe média : création d'albums, upload de photos, gestion des autorisations d'accès photo par photo, publication, archivage et téléchargement d'un album en ZIP.

### Administration (`/admin`)

| Module | Fonctions |
|---|---|
| Tableau de bord | Indicateurs (membres, départements, albums, prédications, événements, finances) |
| Membres | Liste filtrable, fiche détaillée, approbation / refus / suspension, changement de rôle, historique |
| Départements | CRUD, responsable, membres, demandes d'adhésion, archivage, image |
| Galerie | Albums, photos, accès restreints, publication |
| Prédications | CRUD, série, référence biblique, média, publication |
| Événements | CRUD, couverture, inscriptions, export CSV |
| Annonces | CRUD, audience, épinglage, expiration |
| Prière | Boîte de réception des demandes, statut, notes |
| Modération | Témoignages (approbation/refus) et signalements de retrait |
| Finances | Contributions, dépenses, résumé |
| Messagerie | Message d'information aux membres (audience par rôle ou département), aperçu, historique des envois, test de configuration, file d'attente |
| Paramètres | Identité de l'église, couleurs, horaires de culte, réseaux sociaux, logo, hero |
| Journal | Journal d'audit filtrable (action, entité, acteur) |

Les écrans d'administration sont **chargés en différé** : un visiteur du site public ne télécharge pas le back-office.

---

## Stack technique

**Backend**

- Node.js ≥ 20.19 · TypeScript 5.9 · Express 4
- Validation **Zod 4**, erreurs normalisées (`code`, `message`, `details.issues`)
- **pg** (PostgreSQL) et **@electric-sql/pglite** (base embarquée) derrière un adaptateur unique
- Sessions : cookie signé (**jose**), mots de passe hachés en **scrypt** (`node:crypto`)
- **helmet**, **cors**, `express-rate-limit`, **multer** (upload), **archiver** (ZIP d'album)
- Stockage fichiers : disque local avec **URLs signées** expirant en 15 min, ou **Supabase Storage**
- Tests d'intégration **Vitest + supertest** sur une base réelle

**Frontend**

- React 19 · Vite 7 · TypeScript
- **Tailwind CSS 4** (tokens `@theme`), composants maison accessibles
- **TanStack Query 5** (cache, invalidation), **React Router 7**
- **React Hook Form + Zod** (formulaires), **Sonner** (notifications), **Motion**, **lucide-react**, **date-fns** (locale `fr`)
- Tests **Vitest + Testing Library** (jsdom)

---

## Structure du dépôt

```text
.
├── backend/                  API REST
│   ├── src/
│   │   ├── auth/             sessions, hachage, permissions (RBAC)
│   │   ├── config/           chargement et validation des variables d'env
│   │   ├── db/               adaptateur pg / PGlite, helpers de requêtes
│   │   ├── middlewares/      auth, erreurs, validation, rate limit, upload
│   │   ├── modules/          auth, profiles, settings, departments, gallery,
│   │   │                     content, files, public, members, admin
│   │   ├── scripts/          migrate, seed, reset, create-admin, init-super-admin
│   │   ├── services/         fichiers, notifications, vues profil
│   │   ├── storage/          pilotes local et Supabase
│   │   └── app.ts, server.ts
│   ├── tests/api.test.ts     17 tests d'intégration
│   └── .env.example
├── frontend/                 interface React
│   └── src/
│       ├── components/       ui/, layout/, public/, members/, auth/, admin/
│       ├── hooks/            useAuth, useChurchSettings
│       ├── layouts/          Public, Member, Admin
│       ├── pages/            public/, auth/, members/, admin/
│       ├── routes/           AppRoutes + guards (RequireAuth/Approved/Admin/Media/Staff)
│       ├── services/         client API typé
│       ├── styles/           Tailwind 4 + thème
│       ├── types/            contrats de l'API
│       └── utils/            formatage FR, cn
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql     schéma complet
│   │   ├── 0002_rls.sql      politiques Row Level Security
│   │   └── 0003_storage.sql  buckets de stockage
│   └── local/01_auth_stub.sql  schéma `auth` minimal pour PGlite
└── package.json              workspaces npm + scripts racine
```

Volumes : ~53 fichiers / 8 800 lignes côté API, ~71 fichiers / 12 200 lignes côté interface, 4 fichiers SQL.

---

## Prérequis

| Outil | Version |
|---|---|
| Node.js | ≥ 20.19 |
| npm | ≥ 10 |
| PostgreSQL | facultatif — seulement en production ou pour utiliser une base existante |

Aucun serveur de base de données n'est nécessaire en développement : **PGlite** embarque PostgreSQL dans le processus Node, avec persistance dans `backend/var/pglite`.

---

## Installation

```bash
# 1. Dépendances (monorepo : backend + frontend)
npm install

# 2. Configuration
cp backend/.env.example backend/.env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # → SESSION_SECRET
# éditer backend/.env : SESSION_SECRET, ADMIN_BOOTSTRAP_*, SEED_DEMO_DATA, SEED_DEMO_PASSWORD

# 3. Base de données
npm run db:migrate      # applique supabase/migrations
npm run db:seed         # jeu de démonstration (si SEED_DEMO_DATA=true)
npm run init-super-admin -- --email vous@exemple.ci   # compte principal (pasteur)
# le mot de passe est demandé à l'invite masquée : il ne doit jamais être
# passé en argument (il resterait dans l'historique du shell)

# 4. Démarrage (API + interface en parallèle)
npm run dev
```

| Service | URL |
|---|---|
| Site | http://localhost:3000 |
| API | http://localhost:4000/api/v1 |
| Contrôle de santé | http://localhost:4000/api/v1/health → `{"status":"ok","database":"pglite","storage":"local"}` |

Le serveur de développement Vite **proxifie `/api` et `/files`** vers l'API : aucun réglage CORS n'est nécessaire, les cookies restent de première partie. Pour pointer ailleurs : `VITE_API_PROXY=http://localhost:4000 npm run dev:frontend`.

> `npm run dev` lance les deux processus avec `concurrently`. Pour les piloter séparément : `npm run dev:backend` et `npm run dev:frontend`.

---

## Variables d'environnement

Fichier de référence : [`backend/.env.example`](backend/.env.example). Il est chargé depuis `backend/.env` (les variables déjà définies dans l'environnement ont priorité).

### Général

| Variable | Défaut | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `3000` | Port d'écoute de l'API. En développement, mettre `4000` (l'interface occupe 3000). En production, l'API sert aussi l'interface : garder `3000` |
| `API_PREFIX` | `/api/v1` | Préfixe de toutes les routes |
| `FRONTEND_URL` | `http://localhost:3000` | Origine autorisée par défaut (CORS) |
| `CORS_ORIGINS` | — | Origines supplémentaires, séparées par des virgules |
| `PUBLIC_API_URL` | *(vide)* | URL publique de l'API pour les liens signés. **Vide = liens relatifs** (recommandé derrière un proxy) |
| `MAX_UPLOAD_MB` | `25` | Taille maximale d'un fichier uploadé |
| `LOG_LEVEL` | `info` | Seuil de la journalisation du serveur : `debug` \| `info` \| `warn` \| `error` (les messages de niveau inférieur sont ignorés ; en test, seules les erreurs sortent) |

### Base de données

| Variable | Défaut | Description |
|---|---|---|
| `DATABASE_URL` | *(vide)* | Chaîne PostgreSQL. **Vide = PGlite local.** Obligatoire en production |
| `PGLITE_DATA_DIR` | `./var/pglite` | Dossier de persistance PGlite |
| `AUTO_MIGRATE` | `true` | Applique les migrations au démarrage |
| `DB_POOL_MAX` | `10` | Taille du pool PostgreSQL |

### Stockage

| Variable | Défaut | Description |
|---|---|---|
| `STORAGE_DRIVER` | `local` | `local` (URLs signées par l'API) ou `supabase` |
| `STORAGE_LOCAL_DIR` | `./var/uploads` | Dossier des fichiers en local |
| `SUPABASE_URL` | — | Requis si `STORAGE_DRIVER=supabase` |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Requis si `STORAGE_DRIVER=supabase` |
| `SUPABASE_ANON_KEY` | — | Requis si l'authentification Supabase Auth est utilisée |
| `SUPABASE_STORAGE_BUCKET` | `media` | Bucket privé (URLs signées) |
| `SUPABASE_PUBLIC_BUCKET` | `public-assets` | Bucket public (logo, couvertures) |

### Session

| Variable | Défaut | Description |
|---|---|---|
| `SESSION_SECRET` | — | **Obligatoire, ≥ 32 caractères.** Clé de signature des cookies |
| `SESSION_TTL_HOURS` | `168` | Durée de vie de la session (7 jours) |
| `COOKIE_NAME` | `lfe_session` | Nom du cookie |
| `COOKIE_SECURE` | `false` | **`true` derrière HTTPS** |

### Messagerie

| Variable | Défaut | Description |
|---|---|---|
| `MAIL_DRIVER` | `log` | `smtp` (envoi réel), `log` (messages écrits dans les journaux), `off` (aucun envoi) |
| `SMTP_HOST` | — | **Obligatoire si `MAIL_DRIVER=smtp`** |
| `SMTP_PORT` | `587` | 587 = STARTTLS, 465 = TLS implicite |
| `SMTP_SECURE` | `false` | **`true` uniquement pour le port 465** |
| `SMTP_USER` / `SMTP_PASSWORD` | — | Identifiants SMTP (mot de passe d'application pour Gmail) |
| `MAIL_FROM_ADDRESS` | `no-reply@laforteresse.local` | Adresse d'expédition (domaine authentifié SPF/DKIM) |
| `MAIL_FROM_NAME` | — | Nom affiché de l'expéditeur |
| `MAIL_REPLY_TO` | — | Adresse de réponse proposée aux destinataires |
| `MAIL_WORKER_ENABLED` | `true` | Expéditeur automatique de la file |
| `MAIL_WORKER_INTERVAL_SECONDS` | `60` | Fréquence de traitement de la file |
| `MAIL_BATCH_SIZE` | `25` | Messages traités par passage |
| `MAIL_MAX_ATTEMPTS` | `5` | Nombre de tentatives avant échec définitif |

Aucun compte payant n'est requis : tout serveur SMTP convient. Guide complet :
[`docs/MESSAGERIE.md`](docs/MESSAGERIE.md).

### Amorçage et données de démonstration

| Variable | Défaut | Description |
|---|---|---|
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | — | Facultatives, `npm run create-admin` : à retirer après usage (préférez `init-super-admin` et la saisie masquée) |
| `ADMIN_BOOTSTRAP_FIRST_NAME` / `..._LAST_NAME` | `Administrateur` / `Principal` | Nom du premier admin |
| `SEED_DEMO_DATA` | `false` | Active `npm run db:seed` sans `--force` |
| `SEED_DEMO_PASSWORD` | *(aléatoire)* | Mot de passe commun des comptes de démo (≥ 10 caractères). S'il est absent, un mot de passe aléatoire est généré et affiché par le script |

---

## Base de données

### Deux modes, un seul code

L'adaptateur `backend/src/db/client.ts` expose la même API (`query`, `exec`, transactions) au-dessus de `pg` ou de PGlite :

- **Développement / démonstration** : `DATABASE_URL` vide → PostgreSQL embarqué (PGlite), données dans `backend/var/pglite`, aucun service à lancer.
- **Production / Supabase** : `DATABASE_URL` renseignée → pool `pg` classique.

Schéma appliqué par les migrations versionnées dans `supabase/migrations`, plus un *stub* `auth` (`supabase/local/01_auth_stub.sql`) pour reproduire localement le schéma géré par Supabase Auth.

> Détails d'implémentation utiles : PGlite exige `exec()` pour les scripts multi-instructions, ne fournit pas `pgcrypto`, demande un cast explicite des paramètres d'énumération (`$1::public.<enum>`) et ne retourne le nombre de lignes affectées que via `affectedRows`.

### Migrations

| Fichier | Contenu |
|---|---|
| `0001_init.sql` | Profils, adhésion et historique, départements et membres, galerie (albums, photos, accès), prédications, événements et inscriptions, annonces, témoignages, demandes de prière, finances, notifications, journal d'audit |
| `0002_rls.sql` | Row Level Security : cloisonnement des données par rôle |
| `0003_storage.sql` | Buckets Supabase (privé / public) et politiques associées |
| `0004_local_auth_profiles.sql` | Profils indépendants de Supabase Auth (mot de passe scrypt) et lien facultatif `auth_user_id` |
| `0005_security_hardening.sql` | Révocation des privilèges `anon` sur les tables sensibles, garde-fous des triggers |
| `0006_department_nominations.sql` | Nominations des responsables, historique des fonctions et des départements |
| `0007_emails.sql` | File d'envoi `email_outbox`, campagnes, préférence `email_opt_out` |

```bash
npm run db:migrate                 # applique les migrations manquantes
npm run db:seed -- --force         # injecte le jeu de démonstration
npm run db:reset                   # repart de zéro (destructif)
```

### Cycle de vie d'une adhésion

```text
inscription  →  profile_incomplete  →  pending_review  →  approved
                        ↑                    ↓
                    rejected  ───────────────┘
                                         suspended
```

Chaque transition est enregistrée dans `membership_history` (auteur, note, date) et notifiée au membre.

---

## Scripts disponibles

Depuis la racine (ils délèguent au bon workspace) :

| Commande | Effet |
|---|---|
| `npm run dev` | API + interface en parallèle |
| `npm run dev:backend` / `npm run dev:frontend` | Un seul service |
| `npm run build` | Compile l'API (`dist/`) puis construit le frontend |
| `npm start` | Démarre l'API compilée |
| `npm run typecheck` | `tsc --noEmit` sur les deux workspaces |
| `npm run test` | Suites backend puis frontend |
| `npm run db:migrate` | Applique les migrations |
| `npm run db:seed` | Jeu de démonstration (`-- --force` pour ignorer `SEED_DEMO_DATA`) |
| `npm run db:reset` | Réinitialise la base |
| `npm run init-super-admin` | **Compte principal (pasteur)** : mot de passe saisi à l'invite masquée, rôle `admin` + statut approuvé, aucun doublon. Voir [`docs/INITIALISATION_ADMIN.md`](docs/INITIALISATION_ADMIN.md) |
| `npm run create-admin` | Ajoute un administrateur (mot de passe demandé à l'invite) |

Côté `frontend` : `npm run dev --workspace frontend`, `npm run build --workspace frontend`, `npm run test --workspace frontend`.

---

## Comptes de démonstration

Créés par `npm run db:seed` avec `SEED_DEMO_DATA=true` et le mot de passe défini dans `SEED_DEMO_PASSWORD` :

| Compte | Rôle | Statut |
|---|---|---|
| `marie.kouassi@demo.laforteresse.test` | Membre | Approuvé |
| `jean.yao@demo.laforteresse.test` | Responsable de département | Approuvé |
| `esther.diallo@demo.laforteresse.test` | Équipe média | Approuvé |
| `paul.adjoumani@demo.laforteresse.test` | Membre | En attente |
| `grace.bamba@demo.laforteresse.test` | Membre | En attente |
| `samuel.kone@demo.laforteresse.test` | Membre | Profil incomplet |
| `ruth.assamoi@demo.laforteresse.test` | Membre | Refusé |
| `daniel.ouattara@demo.laforteresse.test` | Membre | Suspendu |

L'administrateur n'est **jamais** créé par le seed. Pour le compte principal (pasteur), utilisez `npm run init-super-admin -- --email <adresse>` : le mot de passe est saisi à l'invite masquée, aucun doublon n'est créé, et le compte reçoit le rôle `admin` avec le statut approuvé. La commande `npm run create-admin -- <email>` reste disponible pour un administrateur supplémentaire ; elle lit `ADMIN_BOOTSTRAP_PASSWORD` si la variable est définie, sinon elle demande le mot de passe à l'invite. Dans les deux cas, le mot de passe doit contenir **au moins 10 caractères, une lettre et un chiffre**, et **n'est jamais accepté en argument de commande**.

Le jeu de démonstration comprend aussi 10 départements, 3 prédications, 3 événements avec inscriptions, 4 albums (15 photos) et des annonces, témoignages et demandes de prière.

---

## Routes du site

| Public | Espace membre (`/espace-membre`) | Autres |
|---|---|---|
| `/` | `/` tableau de bord | `/connexion` |
| `/a-propos` | `/profil` | `/inscription` |
| `/predications`, `/predications/:slug` | `/departements` | `/mot-de-passe-oublie` |
| `/evenements`, `/evenements/:slug` | `/annonces` | `/reinitialiser-mot-de-passe` |
| `/departements`, `/departements/:slug` | `/notifications` | `/mon-inscription` (onboarding) |
| `/galerie`, `/galerie/:slug` | `/galerie` | `/media`, `/media/galerie` (équipe média) |
| `/annonces`, `/temoignages`, `/priere` | `/evenements` | `/departements/gestion` (responsables) |
| `/contact`, `/confidentialite` | `/temoignages` | `/admin/*` (administration) |

Les accès sont contrôlés côté client par `RequireAuth`, `RequireApproved`, `RequireAdmin`, `RequireMedia` et `RequireStaff` — et **systématiquement revérifiés côté serveur**.

---

## API

Base : `/api/v1`. Réponses JSON ; erreurs au format `{ "error": { "code", "message", "details" } }`. Authentification par cookie de session `httpOnly`.

| Préfixe | Accès | Contenu |
|---|---|---|
| `/health` | public | État du service, du mode base et du stockage |
| `/auth` | mixte | `register`, `login`, `logout`, `refresh`, `session`, `profile` (PATCH), `profile/submit`, `avatar`, `password`, `forgot-password`, `reset-password`, `me/history` |
| `/public` | public | `settings`, `departments[/:slug]`, `sermons[/:slug]`, `events[/:slug]`, `events/:slug/register`, `announcements`, `albums[/:slug]`, `testimonies`, `prayer-requests`, `gallery/takedown-requests`, `unsubscribe` (GET vérification, POST désinscription par jeton signé) |
| `/members` | membre approuvé | `dashboard`, `announcements`, `albums[/:slug]`, `events`, `events/:slug/register`, `departments`, `departments/:id/requests`, `departments/requests[/:id]`, `notifications`, `notifications/unread-count`, `notifications/:id/read`, `notifications/read-all`, `directory`, `testimonies`, `testimonies/mine`, `prayer-requests/mine`, `audit/mine` |
| `/media` | admin ou média | Albums : `albums`, `albums/:id`, `albums/:id/photos`, `photos/:id`, `albums/:id/access[/:profileId]`, `albums/:id/publish`, `albums/:id/archive`, `albums/:id/download` |
| `/admin` | admin (staff pour les départements) | `/dashboard`, `/members/*` (+ `/:id/nominations`), `/departments/*` (+ `/:id/nominations`), `/sermons/*`, `/events/*` (+ `registrations`, `export`), `/announcements/*`, `/prayer-requests/*`, `/testimonies/*`, `/takedown-requests/*`, `/finance/{contributions,expenses,summary}`, `/settings/*`, `/emails/{status,campaigns,preview,broadcast,test,flush}`, `/audit-logs` |
| `/files/:token` | signé | Sert un fichier via une URL signée à durée limitée (900 s) |

Les listes paginées renvoient `{ <ressource>, pagination: { page, perPage, total, totalPages } }`, avec le nom de la ressource comme clé (`sermons`, `events`, `albums`, `testimonies`, `logs`, `items`…).

**Validation** — une requête invalide renvoie `422 VALIDATION_ERROR` avec le détail par champ dans `details.issues`, que le frontend mappe directement sur les formulaires.

---

## Rôles et permissions

| Rôle | Accès |
|---|---|
| `member` (approuvé) | Espace membre : profil, départements, annonces, notifications, galerie membres, événements, témoignages |
| `department_leader` | Idem + gestion des départements dont il est responsable (`/admin/departments`, `/departements/gestion`), demandes d'adhésion et membres de ces départements |
| `media` | Idem + gestion complète de la galerie (`/media`) |
| `admin` | Accès total au back-office, y compris finances, paramètres et journal d'audit |

Les permissions calculées sont exposées par la session (`isAdmin`, `isMedia`, `canAccessMembersArea`, `canManageGallery`, `canManageDepartments`) et réutilisées par l'interface pour masquer les actions non autorisées — sans jamais remplacer le contrôle serveur.

La création du compte principal (rôle fonctionnel `SUPER_ADMIN_PASTOR` → rôle
technique `admin`) est décrite pas à pas dans
[`docs/INITIALISATION_ADMIN.md`](docs/INITIALISATION_ADMIN.md) : `npm run init-super-admin -- --email <adresse>`,
mot de passe saisi à l'invite masquée, jamais en argument.

La correspondance entre rôles fonctionnels (`SUPER_ADMIN_PASTOR`, `DEPARTMENT_HEAD`, `DEPARTMENT_ASSISTANT`, `MEMBER`, `PENDING_MEMBER`) et ce modèle technique, les règles d'auto-élévation interdites et le cycle de vie des nominations sont détaillés dans [`docs/ROLES_ET_PERMISSIONS.md`](docs/ROLES_ET_PERMISSIONS.md).

### Nominations et historique des fonctions

Un membre nommé dans un département conserve **la date de début**, **la date de fin** et **l'intitulé de sa fonction**. Deux tables coopèrent : `department_members` porte l'affectation courante (contrôles d'accès), `department_nominations` conserve l'historique complet — y compris après la fin de la fonction ou l'archivage du département. Le tableau de bord affiche les **responsables actifs** (titulaires et adjoints) et les **départements actifs**.

---

## Messagerie

L'application prévient les membres par e-mail, sans dépendre d'un prestataire
particulier (tout serveur SMTP convient).

| Message | Envoi |
|---|---|
| Adhésion approuvée / refusée (avec le motif) | automatique, immédiat |
| Réinitialisation du mot de passe (lien 1 h, usage unique) | automatique, immédiat |
| Nomination dans un département | automatique, immédiat |
| Information générale (annonce, événement, nouvelle) | depuis **Administration → Messagerie** |

- Les messages de compte partent toujours ; un membre peut refuser les messages
  d'information depuis son profil (case « Je souhaite recevoir les informations de
  l'église par e-mail », colonne `profiles.email_opt_out`).
- Chaque message est d'abord écrit dans `email_outbox`, puis envoyé par un
  expéditeur : une panne SMTP ne fait échouer aucune action métier, et les échecs
  temporaires sont réessayés automatiquement (1, 2, 4, 8… minutes).
- Les destinataires d'un message d'information sont **calculés par le serveur**
  (membres approuvés, rôle précis ou département) : jamais une liste d'adresses
  transmise par le navigateur.
- Les campagnes et les envois sont tracés (`email_campaigns`, `email_outbox`,
  journal d'audit). Les secrets SMTP ne sont jamais exposés par l'API.

Guide de configuration et de dépannage : [`docs/MESSAGERIE.md`](docs/MESSAGERIE.md).

Désinscription : chaque message d'information contient un lien
`/desinscription?token=…` **utilisable sans connexion**. Le jeton est signé
(HMAC-SHA256, 180 jours) et ne permet de modifier que la préférence de son
destinataire ; la désinscription n'est appliquée qu'après confirmation explicite.

---

## Sécurité et vie privée

- Mots de passe hachés en **scrypt** avec sel aléatoire et comparaison à temps constant.
- Session par cookie `httpOnly` + `sameSite`, `secure` activable par `COOKIE_SECURE=true`.
- **helmet** (en-têtes de sécurité), **CORS** restreint aux origines configurées, garde d'origine sur les requêtes sensibles.
- **Rate limiting** : global (600 req/15 min en production), authentification (20/15 min), écritures publiques (20/h), uploads (120/h) — clé par utilisateur authentifié, IP sinon.
- **Validation Zod** systématique côté serveur (corps, query, paramètres), tailles d'upload limitées.
- **Fichiers** : jamais exposés en direct ; liens signés expirant en 900 s.
- **Vie privée** : l'annuaire des membres n'expose ni e-mail ni téléphone ni statut ; le formulaire de prière est confidentiel ; la galerie permet à toute personne représentée de demander un retrait.
- **Row Level Security** activée dans `0002_rls.sql` pour un déploiement Supabase.
- **Journalisation** : `LOG_LEVEL` filtre réellement les messages du serveur (horodatage ISO, pile des erreurs conservée).

Le détail de l'audit du 27 octobre 2026 (vérifications exécutées, anomalies
corrigées, points restant à la charge de l'exploitant) est dans
[`docs/AUDIT_2026-10-27.md`](docs/AUDIT_2026-10-27.md).
- **Journal d'audit** de toutes les actions administratives (acteur, action, entité, métadonnées).

---

## Tests et vérifications

```bash
npm run typecheck                        # backend + frontend
npm run test                             # 17 tests API + 30 tests interface
```

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit` backend + frontend | ✅ aucune erreur |
| Tests API (Vitest + supertest) | ✅ **17/17** |
| Tests interface (Vitest + Testing Library) | ✅ **30/30** |
| `npm run build` (API + interface) | ✅ build de production |
| CI GitHub Actions | ✅ 3 travaux, voir [Intégration continue](#intégration-continue) |

- **API** (`backend/tests/api.test.ts`) : parcours d'authentification, contrôle d'accès par rôle, validation, CRUD d'administration, finances et téléchargements — exécutés sur une vraie base.
- **Interface** : composants (`ui.test.tsx`), formatage FR (`format.test.ts`), routes (`AppRoutes.test.tsx`) et **fumée de toutes les routes publiques** plus des zones protégées (`routes.smoke.test.tsx`).

---

## Intégration continue

Trois travaux tournent à chaque push sur `main` et sur chaque pull request (`.github/workflows/ci.yml`) :

| Travail | Contenu |
|---|---|
| API — types et tests | `tsc --noEmit` + 17 tests d'intégration |
| Interface — types, tests et build | `tsc --noEmit` + 30 tests + build publié en artefact |
| Image Docker | Construction de l'image pour valider le `Dockerfile` |

Un quatrième workflow (`.github/workflows/docker-publish.yml`) publie l'image de production sur GitHub Container Registry lors d'un tag `v*` :

```bash
git tag v1.0.0 && git push origin v1.0.0   # → ghcr.io/gnavakobenantoussaintjoane-gif/eglise:1.0.0
```

Pour exiger la CI avant fusion : **Settings → Branches → Add rule** sur `main`, case *Require status checks to pass*.

---

## Déploiement

Le dépôt fournit tout ce qu'il faut pour trois scénarios :

| Fichier | Usage |
|---|---|
| `Dockerfile` | Image multi-étapes : l'API sert aussi l'interface compilée (déploiement mono-service, cookies de première partie) |
| `render.yaml` | Blueprint Render (service web Docker + contrôle de santé + variables) |
| `netlify.toml` | Interface statique seule, avec réécriture SPA et cache des assets |
| `.github/workflows/docker-publish.yml` | Publication de l'image sur `ghcr.io` |

En résumé :

1. **Base** — créer un projet Supabase (ou un PostgreSQL managé), renseigner `DATABASE_URL`, appliquer `npm run db:migrate` puis `0002_rls.sql` et `0003_storage.sql`.
2. **Stockage** — `STORAGE_DRIVER=supabase` (recommandé), sinon `STORAGE_LOCAL_DIR=/data/uploads` avec un volume persistant.
3. **Service** — `docker build -t la-forteresse .` puis `docker run` avec `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`, `COOKIE_SECURE=true` et `FRONTEND_URL` ; ou *New → Blueprint* sur Render.
4. **Premier administrateur** — `npm run init-super-admin -- --email <adresse>` depuis un environnement disposant de `DATABASE_URL` (mot de passe saisi à l'invite masquée).
5. **Contrôles** — `GET /api/v1/health` doit répondre `{"status":"ok",...}`, connexion admin, upload d'une photo.

**Base de données de production** : projet Supabase dédié `Eglise`
(ref `abjlyscebvaxbdojmplk`, région `eu-west-1`), avec 5 migrations appliquées
(schéma, RLS, stockage, auth locale, durcissement des privilèges).

⚠️ `SUPABASE_ANON_KEY` doit rester **vide** : le renseigner bascule toute
l'authentification sur Supabase Auth. Voir `docs/DEPLOIEMENT.md` §3.1 bis.

📖 **Guide complet : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md)** — Supabase, variables de production, Docker/Compose, Render, Netlify/Vercel, vérifications après mise en ligne, sauvegardes, retour arrière et dépannage.

Le serveur **refuse de démarrer** si `DATABASE_URL` manque en production ou si `SESSION_SECRET` ressemble à une valeur d'exemple. Ne jamais committer `backend/.env` ni `backend/var/` (déjà couverts par `.gitignore`).

---

## Dépannage

| Symptôme | Cause / solution |
|---|---|
| `SESSION_SECRET doit contenir au moins 32 caracteres` | Générer une valeur : `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `DATABASE_URL est obligatoire en production` | Le stockage PGlite est réservé au développement ; renseigner `DATABASE_URL` |
| Le site s'affiche mais les appels API échouent | L'API n'est pas démarrée sur le port 4000, ou `VITE_API_PROXY` pointe ailleurs |
| La connexion ne « prend » pas | Cookie `secure` activé sans HTTPS, ou `FRONTEND_URL` / `CORS_ORIGINS` différents de l'origine réelle |
| Base dans un état incohérent en développement | `npm run db:reset` puis `npm run db:migrate && npm run db:seed` |
| `Cannot find module` après un `git clone` | `npm install` n'a pas été lancé à la racine (workspaces) |
| Uploads refusés | Vérifier `MAX_UPLOAD_MB` et la limite par type de fichier |

---

## Licence

Distribué sous licence **MIT** — voir [`LICENSE`](LICENSE).

Application de l'église évangélique **La Forteresse de l'Éternel** — Abidjan, Côte d'Ivoire.
