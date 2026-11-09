# Restrictions individuelles

Ce document décrit la fonctionnalité **Restrictions** : retirer une possibilité
précise à un membre sans le suspendre, avec un motif, une trace écrite et la
possibilité de revenir en arrière.

---

## 1. À quoi cela sert

Avant cette fonctionnalité, l'administration ne disposait que de deux leviers :
approuver ou **suspendre** un compte. La suspension coupe tout — un membre qui a
tenu des propos blessants perdait aussi l'accès aux annonces, aux cultes et à son
profil.

Une restriction retire **une seule possibilité** et laisse le membre dans la
communauté. Il reste connecté, il voit ce qui lui est retiré et il lit le motif
que l'administrateur a saisi.

| Code technique | Ce que cela bloque | Libellé affiché |
|---|---|---|
| `event_registration` | S'inscrire à un événement | Inscription aux événements |
| `testimony_submission` | Soumettre un témoignage | Publication de témoignages |
| `gallery_access` | Ouvrir les albums réservés aux membres | Accès à la galerie |
| `directory_listing` | Apparaître dans l'annuaire des membres | Présence dans l'annuaire |
| `department_request` | Demander à rejoindre un département | Demande d'adhésion à un département |

> **Rappel** : la suspension du compte reste disponible dans la fiche membre.
> Elle est prioritaire sur toute restriction.

---

## 2. Qui peut agir

| Rôle | Peut restreindre | Peut être restreint |
|---|---|---|
| Administrateur (`admin`) | Oui | **Non** |
| Responsable de département | Non | Oui |
| Membre approuvé | Non | Oui |
| Membre en attente / refusé | Non | Non (utilisez le statut du compte) |

Trois garde-fous sont appliqués **par le serveur**, pas seulement par l'écran :

1. un administrateur ne peut pas être restreint — sinon un administrateur
   pourrait neutraliser les autres. Retirez d'abord son rôle ;
2. personne ne peut se restreindre soi-même ;
3. seuls les membres **approuvés** peuvent l'être ; pour les autres cas, le
   statut du compte suffit.

Un refus renvoie un code HTTP `400` avec un message explicite en français.

---

## 3. Procédure dans l'interface

1. **Administration → Membres**.
2. Repérer le membre (le badge orange indique déjà le nombre de restrictions
   actives) puis cliquer sur **Examiner**.
3. Dans la fiche, section **Restrictions ciblées** : cocher les possibilités à
   retirer, saisir un **motif** clair.
4. **Enregistrer les restrictions**.

Pour tout rendre : décocher toutes les cases puis cliquer sur
**Lever toutes les restrictions**.

Un motif est facultatif techniquement, mais fortement recommandé : sans lui, le
membre reçoit un message générique. Le motif est **visible par le membre
concerné** ; n'y écrivez rien de confidentiel.

---

## 4. Ce que voit le membre

- Un bandeau apparaît en haut de son espace membre : « Certaines possibilités de
  votre compte sont restreintes », avec la liste et le motif.
- Les actions concernées renvoient un message explicite, par exemple :
  `Publication de témoignages : cette possibilité vous a été retirée par
  l'administration. Motif indiqué : …`
- Il reçoit une notification dans son espace.
- Il reste connecté et garde l'accès aux annonces, aux événements (en lecture),
  à son profil et à ses départements.

---

## 5. Traçabilité

Chaque changement écrit une entrée dans le **journal d'audit** :

| Champ | Contenu |
|---|---|
| Action | `member.restrictions` |
| Entité | `profile` + identifiant du membre |
| Métadonnées | `added`, `removed`, `total` (codes ajoutés / levés) |

Le texte du motif n'est **pas** recopié dans le journal : il reste attaché à la
restriction, où il est nécessaire, et n'est pas dupliqué dans un historique
consultable par plus de monde.

Consultation : **Administration → Journal**, ou `GET /admin/audit-logs?action=member.restrictions`.

---

## 6. API

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/restrictions/catalog` | admin | Catalogue des codes et libellés |
| `GET` | `/api/v1/admin/members/:id/restrictions` | admin | Restrictions actives d'un membre |
| `PUT` | `/api/v1/admin/members/:id/restrictions` | admin | Remplace l'ensemble des restrictions |

Corps de la requête `PUT` :

```json
{ "codes": ["testimony_submission"], "reason": "Propos blessants envers un autre membre." }
```

`PUT` et non `PATCH` : la liste envoyée **devient** l'état complet ; une
restriction absente de la liste est levée. `codes: []` lève tout.

La session du membre (`GET /api/v1/auth/session`) expose ses restrictions :

```json
{
  "restrictions": [
    {
      "code": "testimony_submission",
      "label": "Publication de témoignages",
      "description": "Ne peut plus soumettre de témoignage.",
      "reason": "Propos blessants envers un autre membre.",
      "createdAt": "2026-11-09T13:37:39.973Z"
    }
  ]
}
```

---

## 7. Base de données

Table `public.profile_restrictions` (migration `0008_restrictions.sql`, purement
additive) :

| Colonne | Type | Rôle |
|---|---|---|
| `profile_id` | `uuid` → `profiles(id)` | Membre concerné |
| `code` | `text` | Restriction (contrainte `check` sur les 5 codes) |
| `reason` | `text` | Motif communiqué au membre |
| `created_by` | `uuid` → `profiles(id)` | Administrateur auteur |
| `created_at` | `timestamptz` | Date d'application |

Clé primaire `(profile_id, code)` : une possibilité ne peut être retirée qu'une
fois. RLS activée : lecture par l'administrateur **et** par le membre concerné
uniquement ; écriture réservée à l'administration ; `anon` est révoqué.

---

## 8. Vérifications automatisées

- `backend/tests/api.test.ts` → bloc « API - restrictions individuelles » :
  accès refusé aux non-administrateurs, application multiple, blocage réel des
  actions (403 avec motif), disparition de l'annuaire, exposition au membre,
  levée d'une restriction, refus sur un administrateur, refus d'un code
  inconnu, présence dans le journal d'audit.
- `frontend/src/components/admin/MemberRestrictions.test.tsx` : catalogue venu
  du serveur, envoi du `PUT`, pré-remplissage, bouton « lever », écran désactivé
  pour un administrateur.

```bash
npm test          # API + interface
npm run doctor    # environnement prêt ?
```
