# Guide de déploiement

Ce document décrit la mise en production de l'application : intégration continue, base de données, stockage des fichiers, puis trois façons d'héberger le service.

- [1. Ce qui est fourni](#1-ce-qui-est-fourni)
- [2. Intégration continue](#2-intégration-continue)
- [3. Préparer les services externes](#3-préparer-les-services-externes)
- [4. Variables d'environnement de production](#4-variables-denvironnement-de-production)
- [5. Option A — Docker, un seul conteneur](#5-option-a--docker-un-seul-conteneur)
- [6. Option B — Render via le blueprint](#6-option-b--render-via-le-blueprint)
- [7. Option C — interface statique + API séparées](#7-option-c--interface-statique--api-séparées)
- [8. Après le déploiement](#8-après-le-déploiement)
- [9. Mises à jour et sauvegardes](#9-mises-à-jour-et-sauvegardes)
- [10. Dépannage en production](#10-dépannage-en-production)

---

## 1. Ce qui est fourni

| Fichier | Rôle |
|---|---|
| `.github/workflows/ci.yml` | Types, tests et build à chaque push sur `main` et sur chaque PR ; construit aussi l'image Docker pour valider le `Dockerfile` |
| `.github/workflows/docker-publish.yml` | Publie l'image de production sur **GitHub Container Registry** (`ghcr.io`) lors d'un tag `v*` ou manuellement |
| `Dockerfile` | Image multi-étapes : build des deux workspaces, puis image d'exécution ne contenant que les dépendances de production |
| `.dockerignore` | Réduit le contexte de build (exclut `node_modules`, builds, secrets, données locales) |
| `render.yaml` | Blueprint Render (service web Docker, contrôle de santé, variables d'environnement) |
| `netlify.toml` | Déploiement de l'interface seule, avec réécriture SPA et cache des assets |
| `.nvmrc` | Version de Node utilisée par la CI et les plateformes (22) |

L'API **sert elle-même l'interface compilée** lorsque `NODE_ENV=production` et que `frontend/dist` existe : l'option A (un seul conteneur) est donc la plus simple, et les cookies de session restent de première partie.

---

## 2. Intégration continue

Trois travaux s'exécutent à chaque push sur `main` et sur chaque pull request :

| Travail | Contenu |
|---|---|
| **API — types et tests** | `npm ci`, `tsc --noEmit` (backend), 17 tests d'intégration sur une base PGlite temporaire |
| **Interface — types, tests et build** | `npm ci`, `tsc --noEmit` (frontend), 30 tests, build de production publié en artefact 7 jours |
| **Image Docker** | Construction de l'image (sans publication) — valide le `Dockerfile` à chaque PR |

Aucun secret n'est nécessaire : les tests créent leur propre base et leurs propres variables d'environnement. Pour exiger que la CI passe avant fusion, activer la protection de branche : **Settings → Branches → Add rule** sur `main`, cocher *Require status checks to pass* puis sélectionner les trois travaux.

### Publier une image

```bash
git tag v1.0.0
git push origin v1.0.0          # → ghcr.io/<compte>/<dépôt>:1.0.0 et :latest
```

L'onglet **Actions** permet aussi de déclencher `Publication de l'image` manuellement. L'image produite tourne avec `NODE_ENV=production` et attend les variables de la section 4.

---

## 3. Préparer les services externes

### 3.1 Base de données (obligatoire)

Le stockage PGlite local est **refusé** en production : `DATABASE_URL` doit être renseignée.

**Supabase**

1. Créer un projet, puis récupérer la chaîne de connexion **pooler** (port `6543`) : `Project Settings → Database → Connection string`.
2. L'URL ressemble à `postgresql://postgres.<ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:6543/postgres`.
3. Appliquer les migrations :

```bash
DATABASE_URL="postgresql://…" npm run db:migrate
```

4. Exécuter les politiques de sécurité et le stockage :

```sql
-- dans le SQL Editor de Supabase
-- coller le contenu de supabase/migrations/0002_rls.sql
-- puis celui de supabase/migrations/0003_storage.sql
```

`0001_init.sql` a déjà été appliqué par `db:migrate` ; `0002` et `0003` sont idempotents.

**PostgreSQL managé (Neon, Railway, RDS…)** : même principe, `DATABASE_URL` puis `npm run db:migrate`. Ne pas activer `0002_rls.sql` si l'application se connecte avec un rôle propriétaire qui contourne la RLS — les politiques sont prévues pour l'accès direct via Supabase.

### 3.2 Stockage des fichiers

Deux possibilités :

| Mode | Configuration | Remarque |
|---|---|---|
| **Supabase Storage** (recommandé) | `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Survit aux redéploiements, aucun volume à gérer |
| **Disque local** | `STORAGE_DRIVER=local`, `STORAGE_LOCAL_DIR=/data/uploads` | Exige un **volume persistant** monté sur `/data`, sinon les photos et le logo disparaissent au redéploiement |

Dans les deux cas, les fichiers restent **privés** : ils sont servis par des URL signées expirant en 900 secondes.

### 3.3 Premier administrateur

Le seed de démonstration ne doit **jamais** tourner en production (`SEED_DEMO_DATA=false`). Créer l'administrateur depuis un environnement disposant de `DATABASE_URL` :

```bash
DATABASE_URL="postgresql://…" \
ADMIN_BOOTSTRAP_EMAIL="admin@mon-eglise.ci" \
ADMIN_BOOTSTRAP_PASSWORD="MotDePasseSolide2026!" \
npm run create-admin
```

Le mot de passe doit contenir au moins 10 caractères, une lettre et un chiffre. Une fois le compte créé, **retirer** `ADMIN_BOOTSTRAP_PASSWORD` de l'environnement de production.

---

## 4. Variables d'environnement de production

Obligatoires :

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Chaîne PostgreSQL (pooler) |
| `SESSION_SECRET` | ≥ 32 caractères aléatoires — `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `FRONTEND_URL` | URL publique exacte, ex. `https://eglise.example.org` |
| `COOKIE_SECURE` | `true` (HTTPS) |

Recommandées :

| Variable | Valeur |
|---|---|
| `STORAGE_DRIVER` | `supabase` (ou `local` + volume persistant) |
| `CORS_ORIGINS` | Origines supplémentaires séparées par des virgules, uniquement si l'interface est sur un autre domaine |
| `PUBLIC_API_URL` | **Vide** si l'interface et l'API partagent le domaine (liens signés relatifs) ; sinon l'URL complète de l'API |
| `AUTO_MIGRATE` | `true` pour appliquer les migrations au démarrage, `false` si vous préférez les appliquer manuellement |
| `SEED_DEMO_DATA` | `false` |
| `MAX_UPLOAD_MB` | `25` (adapter selon l'hébergeur) |
| `LOG_LEVEL` | `info` |

> Le serveur **refuse de démarrer** si `DATABASE_URL` manque en production ou si `SESSION_SECRET` ressemble à une valeur d'exemple (`change_me`, `example`, `placeholder`). C'est volontaire.

---

## 5. Option A — Docker, un seul conteneur

```bash
# 1. Construire l'image (ou utiliser ghcr.io/<compte>/<dépôt>:<tag>)
docker build -t la-forteresse .

# 2. Lancer le service
docker run -d --name la-forteresse \
  -p 4000:4000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://…" \
  -e SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" \
  -e FRONTEND_URL="https://eglise.example.org" \
  -e COOKIE_SECURE=true \
  -e STORAGE_DRIVER=supabase \
  -e SUPABASE_URL="https://<ref>.supabase.co" \
  -e SUPABASE_SERVICE_ROLE_KEY="…" \
  -v eglise-data:/data \
  la-forteresse

# 3. Vérifier
curl -fsS http://localhost:4000/api/v1/health
```

L'image :

- exécute le processus avec l'utilisateur non privilégié `node` ;
- expose `/data` (volume) pour les uploads et une éventuelle base PGlite ;
- déclare un `HEALTHCHECK` sur `/api/v1/health` (échec si la base est injoignable) ;
- sert l'interface compilée sur `/` (y compris les routes profondes comme `/galerie`, réécrites vers `index.html`) et l'API sur `/api/v1`.

Le conteneur reste démarré même si la base est momentanément injoignable : le contrôle de santé passe alors en échec (`503`) et l'orchestrateur décide de redémarrer ou non.

Compose minimal pour un serveur avec reverse proxy (Caddy, Nginx, Traefik) :

```yaml
services:
  app:
    image: ghcr.io/<compte>/<depot>:latest
    restart: unless-stopped
    env_file: .env
    volumes:
      - donnees:/data
    ports:
      - "127.0.0.1:4000:4000"

volumes:
  donnees:
```

Le proxy doit transmettre `X-Forwarded-Proto: https` et le nom d'hôte d'origine ; les cookies de session sont `httpOnly`, `sameSite=lax` et `secure` lorsque `COOKIE_SECURE=true`.

---

## 6. Option B — Render via le blueprint

1. Pousser le dépôt sur GitHub (déjà fait), puis **New → Blueprint** dans Render et sélectionner le dépôt : `render.yaml` est détecté.
2. Renseigner les variables demandées (`DATABASE_URL`, `FRONTEND_URL`, `CORS_ORIGINS`, clés Supabase, identifiants de l'administrateur).
3. `SESSION_SECRET` est généré automatiquement par Render (`generateValue: true`).
4. Déployer, puis vérifier `https://<service>.onrender.com/api/v1/health`.

Points d'attention :

- Le plan gratuit **n'accepte pas de disque persistant** : garder `STORAGE_DRIVER=supabase`.
- Le contrôle de santé `/api/v1/health` conditionne la mise en service du service.
- Le nom de domaine personnalisé se configure dans **Settings → Custom Domains** ; mettre ensuite `FRONTEND_URL` à jour et redéployer.

---

## 7. Option C — interface statique + API séparées

Utile si l'interface est hébergée sur un CDN et l'API ailleurs (ou sur un autre domaine).

### 7.1 API

Déployer le conteneur (option A) ou l'application Node (`npm ci && npm run build && npm start`) avec `PUBLIC_API_URL` = URL publique de l'API (ex. `https://api.eglise.example.org`) et `CORS_ORIGINS` = domaine de l'interface.

Si l'interface et l'API sont sur des domaines **différents**, les cookies tiers peuvent être bloqués par les navigateurs : préférer un sous-domaine commun (`eglise.example.org` + `api.eglise.example.org`) avec `sameSite=lax` fonctionnel, ou servir les deux derrière le même domaine via un proxy.

### 7.2 Interface

**Netlify** — `netlify.toml` est déjà fourni :

1. **Add new site → Import an existing project**, choisir le dépôt.
2. Définir `VITE_API_URL=https://api.eglise.example.org/api/v1` dans *Site settings → Environment variables*.
3. Déployer. La réécriture SPA et le cache long des assets sont déjà configurés.

**Vercel** — équivalent : framework *Vite*, root directory `frontend`, build `npm run build`, output `dist`, variable `VITE_API_URL`, plus une réécriture `/(.*) → /index.html`.

**N'importe quel serveur statique** : publier `frontend/dist` et réécrire toutes les routes vers `index.html`.

> `VITE_API_URL` est lue **au build** : après un changement, reconstruire l'interface. Laissée vide, elle vaut `/api/v1` (même origine).

---

## 8. Après le déploiement

| Contrôle | Attendu |
|---|---|
| `GET /api/v1/health` | `{"status":"ok","database":"pg","storage":"supabase"}` — **503** avec `{"status":"degraded","database":"unreachable"}` si la base ne répond pas |
| Page d'accueil | S'affiche, nom et slogan issus des paramètres |
| Connexion administrateur | Redirige vers `/admin` |
| Upload d'une photo (espace média) | Réussit, puis l'URL signée expire après 15 min |
| Cookie de session | Attributs `HttpOnly`, `SameSite=Lax`, `Secure` |
| `http://` → `https://` | Redirection automatique par l'hébergeur |

Parcours de vérification rapide :

1. Créer un compte depuis `/inscription` avec une adresse réelle.
2. Vérifier qu'il apparaît dans **Administration → Membres** à l'état *En attente*.
3. L'approuver, se connecter : l'espace membre doit s'ouvrir.
4. Envoyer une demande de prière, une inscription à un événement et un témoignage.
5. Contrôler que le journal d'audit enregistre les actions d'administration.

---

## 9. Mises à jour et sauvegardes

**Déployer une nouvelle version**

```bash
git push origin main        # la CI revalide types, tests et image
git tag v1.1.0 && git push origin v1.1.0   # publie l'image si vous l'utilisez
```

Sur Render, `autoDeploy: true` redéploie à chaque push sur `main`. Avec Docker, relancer `docker pull` puis `docker compose up -d`.

**Sauvegardes**

- **Base** : sauvegarde automatique Supabase (quotidienne selon le plan) ; sinon `pg_dump "$DATABASE_URL" > sauvegarde.sql`.
- **Fichiers** : Supabase Storage est répliqué ; en mode local, sauvegarder le volume `/data`.
- **Secrets** : conserver `SESSION_SECRET` en lieu sûr — le changer invalide toutes les sessions actives.

**Retour arrière** : redéployer le tag d'image précédent (`ghcr.io/...:1.0.0`). Les migrations étant additives (`schema_migrations`), un retour arrière applicatif reste possible tant qu'aucune colonne n'a été supprimée.

---

## 10. Dépannage en production

| Symptôme | Cause probable |
|---|---|
| `DATABASE_URL est obligatoire en production` | Variable absente ou vide sur l'hébergeur |
| `SESSION_SECRET doit contenir au moins 32 caracteres` | Secret trop court |
| Le serveur refuse de démarrer avec `SESSION_SECRET` suspect | La valeur contient `change_me`, `example` ou `placeholder` |
| Page blanche, erreurs 404 sur les routes | Réécriture SPA absente (Netlify/Vercel/nginx) |
| Connexion impossible, pas de cookie | `COOKIE_SECURE=false` en HTTPS, ou `FRONTEND_URL`/`CORS_ORIGINS` différents du domaine réel |
| Images 403 ou cassées | `STORAGE_DRIVER=local` sans volume persistant, ou `SUPABASE_SERVICE_ROLE_KEY` invalide |
| Liens signés en `http://localhost` | `PUBLIC_API_URL` vide derrière un proxy qui ne transmet pas `Host`/`X-Forwarded-*` |
| `relation "profiles" does not exist` | Migrations non appliquées (`npm run db:migrate` ou `AUTO_MIGRATE=true`) |
| Les uploads échouent à 25 Mo | `MAX_UPLOAD_MB` ou limite de l'hébergeur/proxy |
