# Messagerie : envoyer des informations aux membres

L'application envoie des e-mails aux membres sans dépendre d'un prestataire
particulier : n'importe quel serveur **SMTP** convient (serveur de l'église,
Brevo, Mailgun, OVH, Gmail professionnel, Amazon SES…). Aucun abonnement payant
n'est nécessaire pour le fonctionnement du logiciel.

---

## 1. Ce qui est envoyé automatiquement

| Situation | Destinataire | Peut-on le désactiver ? |
|---|---|---|
| Demande d'adhésion **approuvée** | la personne concernée | non (message de compte) |
| Demande d'adhésion **refusée** (avec le motif) | la personne concernée | non |
| **Mot de passe oublié** (lien valable 1 h, usage unique) | la personne concernée | non |
| **Nomination** dans un département (fonction, date de début) | le membre nommé | non |
| **Message d'information** rédigé par un administrateur | audience choisie | oui, chaque membre peut refuser |

Les quatre premiers sont des messages **transactionnels** : ils conditionnent
l'accès au compte ou portent une décision qui concerne la personne. Ils partent
même si le membre a refusé les messages d'information. Le dernier est un message
**d'information** : il respecte la préférence du membre, modifiable dans
« Mon profil » (case « Je souhaite recevoir les informations de l'église par
e-mail »).

---

## 2. Configurer l'envoi

Tout se règle par variables d'environnement, dans `backend/.env` (ou dans les
variables du service d'hébergement). Aucun secret ne doit être versionné.

```bash
MAIL_DRIVER=smtp          # smtp | log | off
SMTP_HOST=smtp.exemple.org
SMTP_PORT=587             # 587 = STARTTLS (le plus courant), 465 = TLS implicite
SMTP_SECURE=false         # true uniquement pour le port 465
SMTP_USER=utilisateur
SMTP_PASSWORD=mot-de-passe-applicatif
MAIL_FROM_ADDRESS=no-reply@mon-eglise.org
MAIL_FROM_NAME=La Forteresse de l'Éternel
MAIL_REPLY_TO=pasteur@mon-eglise.org
MAIL_WORKER_ENABLED=true
MAIL_WORKER_INTERVAL_SECONDS=60
MAIL_BATCH_SIZE=25
MAIL_MAX_ATTEMPTS=5
```

### Les trois modes

| `MAIL_DRIVER` | Comportement | Usage |
|---|---|---|
| `log` (défaut) | Le message est écrit dans les journaux du serveur (destinataire, objet, taille — jamais le contenu complet) et marqué envoyé. | Développement, démonstration |
| `smtp` | Envoi réel par le serveur configuré. | Production |
| `off` | Rien n'est envoyé ; les messages restent en attente dans la file. | Maintenance, environnement sans réseau |

> En production, si `MAIL_DRIVER` n'est pas `smtp`, l'application démarre mais
> signale l'anomalie au démarrage **et** dans l'écran Messagerie : aucun e-mail ne
> quittera réellement le serveur.

### Choisir un fournisseur

- **Serveur de l'église** : utilisez l'hôte SMTP de votre hébergeur de messagerie
  avec un compte dédié.
- **Brevo / Mailgun / Postmark** : créez une clé SMTP, renseignez `SMTP_HOST`,
  `SMTP_USER` et `SMTP_PASSWORD`.
- **Gmail professionnel** : activez la validation en deux étapes puis créez un
  « mot de passe d'application » (le mot de passe du compte ne fonctionne pas).

Points à vérifier avant une campagne réelle :

1. le domaine d'envoi est **authentifié** (SPF/DKIM) chez le fournisseur — sans
   cela, les messages finissent en indésirables ;
2. `MAIL_FROM_ADDRESS` appartient à un domaine autorisé par le fournisseur ;
3. `MAIL_REPLY_TO` pointe sur une boîte réellement relevée ;
4. un message de test arrive bien (bouton « Envoyer le test »).

---

## 3. Utiliser l'écran Messagerie

Menu **Administration → Messagerie** (réservé aux administrateurs).

1. **Nouveau message** : objet, texte, puis choix des destinataires.
2. **Aperçu** : affiche le rendu exact du message avant envoi.
3. **Envoyer** : une confirmation rappelle l'audience et le fait qu'un e-mail
   envoyé ne peut pas être annulé.
4. **Historique des messages** : chaque campagne apparaît avec le nombre
   d'envois réussis, en attente ou en échec.

### Audiences disponibles

| Audience | Destinataires |
|---|---|
| Tous les membres approuvés | inscriptions validées uniquement |
| Membres ayant un rôle précis | `member`, `department_leader`, `media`, `admin` |
| Membres d'un département | affectations actives de ce département |

Les destinataires sont **calculés par le serveur** à partir de l'audience. Le
navigateur n'envoie jamais de liste d'adresses : l'application ne peut pas être
détournée pour envoyer du courrier à des inconnus.

L'option « Inclure les membres qui ont refusé les messages d'information » existe
pour une information réellement indispensable ; elle est tracée dans le journal
d'audit.

---

## 4. Comment l'envoi est fiabilisé

Chaque message est d'abord **écrit en base** (`email_outbox`), puis un expéditeur
le prend en charge :

1. un fournisseur lent ne bloque pas la requête de l'administrateur ;
2. une panne temporaire est **réessayée** automatiquement (1, 2, 4, 8… minutes,
   plafonné) jusqu'à `MAIL_MAX_ATTEMPTS`, puis marquée en échec ;
3. deux processus ne traitent jamais le même message (verrou `for update skip
   locked`) ;
4. le bouton **« Traiter la file maintenant »** force une relance immédiate sans
   attendre la temporisation ;
5. les envois sont tracés dans le **journal d'audit** (acteur, audience, volume)
   sans conserver le contenu du message.

Tables concernées : `email_outbox` (file et historique par destinataire),
`email_campaigns` (un enregistrement par message d'information), et
`profiles.email_opt_out` (préférence du membre).

---

## 5. Réponses, désinscription et vie privée

- Chaque message contient l'adresse et le téléphone de l'église, et
  `MAIL_REPLY_TO` est proposé comme adresse de réponse.
- Les messages d'information contiennent un lien de désinscription qui
  fonctionne **sans connexion** : `/desinscription?token=…`. Le jeton est signé
  (HMAC-SHA256 avec `SESSION_SECRET`, valable 180 jours) et porte l'identifiant
  du profil ; il est impossible de désinscrire quelqu'un d'autre en modifiant
  l'URL. La page affiche l'adresse partiellement masquée et demande une
  confirmation explicite (aucun effet sur un simple aperçu de lien).
  La préférence reste modifiable depuis l'espace membre.
- Le contenu des messages n'est pas journalisé en intégralité : seuls
  l'objet, l'audience et les compteurs le sont.
- Les secrets SMTP ne sont **jamais** exposés par l'API : l'écran Messagerie
  n'affiche que l'hôte, le port et l'adresse d'expédition.

### Endpoints publics concernés

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/v1/public/unsubscribe?token=…` | vérifie le jeton, renvoie l'adresse masquée, ne modifie rien |
| `POST` | `/api/v1/public/unsubscribe` | applique la désinscription (`{ "token": "…" }`), idempotent, journalisé (`email.unsubscribe`) |

Les deux routes sont limitées à 20 appels par heure et par adresse IP.

---

## 6. Vérifier ou dépanner

| Symptôme | Piste |
|---|---|
| Aucun message ne part, statut « Journal » | `MAIL_DRIVER=log` : passez à `smtp` et redémarrez |
| « Envoi impossible : … » sur le test | identifiants, port (587/465), `SMTP_SECURE` |
| Messages en indésirables | SPF/DKIM du domaine, `MAIL_FROM_ADDRESS` |
| « Ce lien de désinscription a expiré » | jeton de plus de 180 jours : la personne peut se désinscrire depuis son profil |
| Messages en échec dans l'historique | lisez la dernière erreur affichée en haut de l'écran Messagerie |
| Un membre ne reçoit rien | il a peut-être refusé les informations : vérifiez son profil |

Pour un diagnostic en ligne de commande :

```bash
npm run dev --workspace backend   # puis, dans un autre terminal :
curl -s -b cookies.txt http://localhost:4000/api/v1/admin/emails/status
```

Tests automatisés de la messagerie (transport en mémoire, aucun envoi réseau) :

```bash
npm test --workspace backend
```
