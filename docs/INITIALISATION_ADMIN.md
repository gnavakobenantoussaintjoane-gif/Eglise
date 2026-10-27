# Initialiser le compte principal (pasteur / super administrateur)

Ce document décrit la procédure officielle pour créer **votre** compte
administrateur — le compte principal de l'église, seul détenteur de l'ensemble
des permissions du back-office.

---

## 1. Point de départ : comment cette application authentifie

Avant toute manipulation, il faut connaître un fait architectural important :

> L'application **gère elle-même ses comptes**. Le mot de passe est haché en
> **scrypt** avec un sel aléatoire, et la session est un cookie signé (`jose`).
> Supabase Auth (GoTrue) **n'est pas** le fournisseur d'authentification actif.

Conséquences concrètes :

| Ce que vous faites | Résultat |
|---|---|
| Créer un utilisateur dans le tableau de bord Supabase → Authentication | **Aucun accès à l'application** : ce compte ne serait jamais relié à un profil |
| Renseigner `SUPABASE_ANON_KEY` pour activer Supabase Auth | Bascule **toute** l'authentification : opération lourde, à décider explicitement, qui n'est pas nécessaire ici |
| Utiliser `npm run init-super-admin` | **Procédure correcte** : le compte est créé dans le référentiel réel de l'application, avec les mêmes garanties (mot de passe haché, jamais en clair) |

La table `auth.users` sert de référentiel de comptes à l'application. Le profil
(`public.profiles`) porte le rôle et le statut.

---

## 2. Procédure recommandée (une seule commande)

Dans un **terminal réel** (pas un pipe, pas une CI), à la racine du projet :

```bash
npm run init-super-admin -- --email joannegnava@gmail.com
```

Le script :

1. affiche la base ciblée (`pglite` en local, `pg` pour Supabase/PostgreSQL) ;
2. prévient si un compte existe déjà pour cette adresse ;
3. demande le **mot de passe** et sa confirmation, **avec l'écho masqué** ;
4. demande le prénom et le nom affichés (valeurs par défaut proposées) ;
5. crée le compte : rôle `admin`, statut `approved`, mot de passe haché ;
6. journalise l'opération dans l'historique d'adhésion et le journal d'audit.

### Brancher sur votre base Supabase

Le script écrit dans la base pointée par `DATABASE_URL`, que **vous** seul
détenez (mot de passe de la base, jamais transmis, jamais affiché) :

```bash
# dans backend/.env, sur votre machine uniquement — ne jamais versionner
DATABASE_URL=postgresql://postgres@db.<projet>.supabase.co:5432/postgres
```

Puis relancez la commande ci-dessus. Le script indiquera
`[init-super-admin] cible : base distante`.

> Le sandbox d'assistance n'a **pas** d'accès réseau à PostgreSQL et ne détient
> aucun identifiant de base : la création doit donc être exécutée par vous.

---

## 3. Pourquoi le mot de passe n'est jamais passé en argument

```bash
# À NE JAMAIS FAIRE : le mot de passe reste dans l'historique du shell,
# dans la liste des processus (ps) et dans les journaux de CI.
npm run init-super-admin -- --email ... --password MonMotDePasse
```

Le script **refuse** tout argument qui ressemble à un mot de passe et exige un
terminal interactif. Moyens de saisie refusés volontairement :

- argument de commande (historique du shell, `ps`) ;
- variable d'environnement persistée (fichier de configuration) ;
- fichier, journal, ou message de commit.

Le mot de passe ne quitte jamais la mémoire du processus : il est haché
immédiatement (`scrypt$<sel>$<dérivé>`) et seul ce dérivé est écrit en base.

---

## 4. Options utiles

| Option | Effet |
|---|---|
| `--verify` | Affiche l'état du compte (rôle, statut, mot de passe défini, nombre d'administrateurs) sans rien modifier |
| `--promote` | Si un compte existe déjà pour cette adresse, l'élève au rôle `admin` **sans créer de doublon** |
| `--reset-password` | Redéfinit le mot de passe d'un compte déjà administrateur (mot de passe oublié) |
| `--force` | Autorise la création d'un **second** administrateur (garde-fou désactivé volontairement) |

Exemples :

```bash
# Vérifier l'état avant/après
npm run init-super-admin -- --email joannegnava@gmail.com --verify

# Le compte existe déjà en simple membre : le promouvoir
npm run init-super-admin -- --email joannegnava@gmail.com --promote

# Mot de passe perdu, compte déjà administrateur
npm run init-super-admin -- --email joannegnava@gmail.com --reset-password
```

---

## 5. Garde-fous appliqués

| Risque | Protection |
|---|---|
| Doublon de compte | Un compte existant pour la même adresse est **réutilisé**, jamais dupliqué (`--promote` explicite) |
| Élévation silencieuse de privilèges | La promotion d'un compte existant exige `--promote` |
| Second administrateur accidentel | Refus si un administrateur actif existe déjà, sauf `--force` |
| Mot de passe faible | Minimum 10 caractères, au moins une lettre et un chiffre ; refus sans aucune écriture |
| Mot de passe en clair | Hachage scrypt immédiat ; jamais journalisé, jamais affiché |
| Absence de trace | Historique d'adhésion + journal d'audit (`admin.bootstrap`, `admin.promote`, `admin.password_reset_bootstrap`) |
| Auto-promotion par un membre | Impossibilité côté API (`403`) **et** garde-fou PostgreSQL (`guard_profile_privileges`) |

Le garde-fou PostgreSQL est un déclencheur `before update` sur `public.profiles` :
même en cas de faille applicative, un utilisateur authentifié ne peut modifier
ni son `role`, ni son `status`, ni les champs de revue de sa demande.

---

## 6. Vérifier après l'opération

```bash
# 1. État du compte en base
npm run init-super-admin -- --email joannegnava@gmail.com --verify

# 2. Connexion réelle
#    Ouvrez /connexion, connectez-vous, puis vérifiez l'accès à /admin
```

Attendu : `role : admin`, `statut : approved`, `mot de passe defini : oui`,
accès complet au tableau de bord.

---

## 7. Correspondance « SUPER_ADMIN_PASTOR »

Le rôle fonctionnel `SUPER_ADMIN_PASTOR` n'est pas une valeur distincte stockée
en base : il correspond au rôle technique **`admin`** avec le statut
`approved`. C'est le seul rôle qui ouvre l'ensemble du back-office
(approbation des membres, attribution des rôles, départements, logo, annonces,
événements, prédications, galerie, finances, journal d'audit).

Cette correspondance est détaillée dans [`ROLES_ET_PERMISSIONS.md`](ROLES_ET_PERMISSIONS.md).
Renommer l'énumération PostgreSQL serait une opération destructive (réécriture de
toutes les politiques RLS) sans gain fonctionnel : elle n'a pas été faite.

---

## 8. En cas de problème

| Symptôme | Cause probable | Solution |
|---|---|---|
| `Terminal interactif requis` | Commande lancée dans un pipe ou une CI | Relancer dans un terminal |
| `Un administrateur actif existe deja` | Un compte admin est déjà présent | Se connecter avec celui-ci, ou `--force` si un second est réellement voulu |
| `Un compte existe deja pour …` | Compte déjà créé (autre rôle) | `--promote` |
| `DATABASE_URL` absente | Cible locale (PGlite) | Renseigner `DATABASE_URL` pour viser Supabase |
| Connexion refusée après création | Mauvais mot de passe saisi | `--reset-password` |
