# Rôles, permissions et nominations

Ce document décrit **qui peut faire quoi** dans l'application, comment les rôles
fonctionnels demandés sont traduits dans le modèle technique existant, et comment
les nominations de responsables sont historisées.

Tout ce qui est décrit ici est appliqué **côté serveur** (`backend/src/auth/permissions.ts`,
middlewares de routes) et, pour un déploiement Supabase, **côté PostgreSQL**
(politiques RLS de `supabase/migrations/0002_rls.sql` et `0006_department_nominations.sql`).
L'interface ne fait que masquer les actions interdites : elle ne constitue jamais
la barrière de sécurité.

---

## 1. Correspondance entre rôles fonctionnels et modèle technique

Le modèle technique repose sur deux colonnes seulement, ce qui évite de dupliquer
l'information :

- `profiles.role` (enum `public.app_role`) : le rôle **global** de la personne ;
- `profiles.status` (enum `public.member_status`) : l'état de son **adhésion** ;
- `department_members.member_role` (`leader` / `assistant` / `member`) : sa
  fonction **à l'intérieur d'un département**.

| Rôle fonctionnel | Représentation en base | Portée |
|---|---|---|
| `SUPER_ADMIN_PASTOR` | `profiles.role = 'admin'` | Accès total : approbation des membres, rôles, départements, contenus, logo, annonces, événements, prédications, galerie, journal d'audit |
| `DEPARTMENT_HEAD` | `profiles.role = 'department_leader'` **et** `department_members.member_role = 'leader'` dans son département | Gestion limitée à ses départements : équipe, demandes d'adhésion, contenus de son service |
| `DEPARTMENT_ASSISTANT` | `profiles.role = 'member'` **et** `department_members.member_role = 'assistant'` | Consultation et aide à la gestion de son département, sans droit de nomination |
| `MEMBER` | `profiles.role = 'member'` + `profiles.status = 'approved'` | Espace membre : profil, annonces, galerie membres, événements, témoignages, annuaire |
| `PENDING_MEMBER` | `profiles.status in ('profile_incomplete', 'pending_review')` | Aucun accès à l'espace membre ; peut seulement compléter et soumettre sa demande |

**Pourquoi des noms techniques différents ?** Les noms `SUPER_ADMIN_PASTOR` et
`DEPARTMENT_HEAD` sont des libellés fonctionnels. Les valeurs stockées
(`admin`, `department_leader`) sont l'identité technique utilisée par les
politiques RLS, les gardes de routes et les tests. Renommer l'enum serait une
migration destructive (réécriture de l'enum, de toutes les politiques, du
frontend et des tests) sans gain fonctionnel : la correspondance ci-dessus fait
foi. Les libellés affichés aux utilisateurs restent en français
(`frontend/src/utils/format.ts`, constante `ROLE_LABEL`).

---

## 2. Ce que chaque rôle peut faire

| Action | `admin` | `department_leader` | `member` | non approuvé |
|---|---|---|---|---|
| Approuver / refuser / suspendre une adhésion | oui | non | non | non |
| Attribuer un rôle global | oui | **non** | non | non |
| Créer / modifier / archiver un département | oui | non | non | non |
| Nommer un membre dans **son** département | oui | oui | non | non |
| Mettre fin à une fonction dans **son** département | oui | oui | non | non |
| Consulter l'historique des nominations de son département | oui | oui | non | non |
| Publier annonces, événements, prédications, galerie | oui | selon son périmètre | non | non |
| Modifier le logo / l'identité visuelle | oui | non | non | non |
| Consulter le journal d'audit | oui | non | non | non |
| Accéder à l'espace membre | oui | oui (si approuvé) | oui | non |

### Règles garanties par le serveur

1. **Aucune auto-élévation** : un utilisateur ne peut pas modifier son propre
   rôle (`changeMemberRole` refuse si `targetId === actor.id`).
2. **Aucune auto-approbation** : la route `PATCH /admin/members/:id/status`
   exige le rôle `admin` ; une personne non approuvée n'y a pas accès, et un
   administrateur ne peut pas valider sa propre fiche.
3. **Un responsable ne peut pas devenir administrateur** : l'attribution de
   rôle est réservée aux administrateurs (`requireAdmin`), donc un
   `department_leader` reçoit `403` même sur sa propre fiche.
4. **Périmètre des responsables** : `canManageDepartment` limite les actions
   d'un `department_leader` aux départements dont il est `leader` actif.
5. **Dernier administrateur protégé** : impossible de retirer le rôle du dernier
   administrateur actif.
6. **Membres non approuvés** : l'espace membre répond `403` tant que
   `status != 'approved'`.

Ces règles sont couvertes par des tests automatisés
(`backend/tests/api.test.ts`, section « permissions sensibles et historique des
nominations »).

---

## 3. Premier administrateur

Aucun mot de passe n'est écrit dans le code. La procédure officielle est une
commande serveur exécutée par la personne qui administre le déploiement :

```bash
npm run init-super-admin -- --email pasteur@exemple.org
```

Le mot de passe est demandé à l'invite masquée : il ne doit **jamais** être
passé en argument (il resterait dans l'historique du shell et la liste des
processus). Le script crée (ou promeut) un compte `admin` approuvé, journalise
l'opération, n'accepte jamais de mot de passe par défaut et ne crée pas de
doublon. Sur Supabase, l'opération se fait
depuis un environnement disposant de `DATABASE_URL`, jamais depuis le navigateur.

---

## 4. Nominations : fonction, début, fin, historique

Deux tables collaborent :

| Table | Rôle |
|---|---|
| `department_members` | Affectation **courante** (une ligne par membre et par département), avec `member_role`, `started_on`, `ended_on`, `function_title` |
| `department_nominations` | **Historique** de toutes les nominations, y compris terminées, avec le nom du département recopié, la fonction, les dates, l'auteur de la nomination et le motif de fin |

### Cycle de vie

1. **Nomination** — `POST /admin/departments/:id/members`
   Corps : `{ profileId, role, functionTitle?, startedOn? }`.
   Le serveur vérifie que le membre est **approuvé**, écrit l'affectation
   courante puis crée une ligne d'historique `status = 'active'`. Si une
   nomination était déjà active pour ce membre dans ce département, elle est
   clôturée à la date de début de la nouvelle.
2. **Fin de fonction** — `DELETE /admin/departments/:id/members/:profileId`
   Corps facultatif : `{ reason? }`.
   L'affectation courante passe à `status = 'left'` (la ligne n'est **pas**
   supprimée) et la nomination active est clôturée (`ended_on`, `end_reason`).
3. **Consultation** —
   `GET /admin/departments/:id/nominations` (admin ou responsable du
   département) et `GET /admin/members/:id/nominations` (admin).
4. **Désactivation / archivage d'un département** — l'historique reste lisible :
   `department_id` passe à `null` en cas de suppression, mais `department_name`
   conserve le nom d'origine. Aucune ligne d'historique n'est effacée.

### Indicateurs

Le tableau de bord expose `departments.leadersActive` : nombre de **personnes
distinctes** exerçant une fonction de responsable ou d'adjoint dans un
département actif. Un membre qui dirige deux départements compte une seule fois.

---

## 5. Vérifier ou adapter une règle

- Contrôles de routes : `backend/src/modules/admin/routes.ts` (`requireAdmin`,
  `requireStaff`, `assertDepartmentScope`).
- Calcul des permissions : `backend/src/auth/permissions.ts`.
- Politiques PostgreSQL : `supabase/migrations/0002_rls.sql` (fonctions
  `public.is_admin()`, `public.is_department_leader(uuid)`).
- Tests des cas interdits : `backend/tests/api.test.ts`.

Toute modification d'une règle doit être accompagnée d'un test qui prouve que le
cas interdit reste refusé.
