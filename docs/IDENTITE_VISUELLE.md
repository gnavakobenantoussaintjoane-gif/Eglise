# Identité visuelle et animations

## 1. Les fichiers fournis

Trois photos ont servi de source : le visuel du logo, l'affiche
« Forteresse de l'Eternel — Le Réveil par l'Amour du Christ » et le détail de la
vision. Elles ne sont **pas** versionnées telles quelles : les éléments utiles en
ont été extraits pour rester légers et utilisables par le site.

| Fichier livré | Source | Usage |
|---|---|---|
| `frontend/public/brand/logo-mark.png` | monogramme « F » + aigle + flamme, détouré | favicon, en-tête, médaillon du hero, espace membre, administration |
| `frontend/public/brand/logo.png` | monogramme + « FORTERESSE DE L'ÉTERNEL » + signature | bloc « Notre identité » de l'accueil |
| `frontend/public/brand/apple-touch-icon.png` | monogramme sur fond transparent | icône sur écran d'accueil mobile |
| `frontend/public/brand/hero-lion.jpg` | regard du lion de l'affiche, recadré, adouci et teinté violet | fond animé du hero et de l'écran de connexion |

Les fichiers sont dans `frontend/public/` : ils sont servis à la racine du site
(`/brand/...`) et copiés tels quels dans `dist/` au build.

### Remplacer par un logo vectoriel

Un logo téléversé par un administrateur (**Administration → Paramètres → Logo**)
reste **prioritaire** sur ces fichiers. Dès qu'un SVG ou PNG haute définition est
disponible, il suffit de le téléverser : aucune modification de code n'est
nécessaire.

## 2. Couleurs

Relevées sur le monogramme et la flamme, elles complètent la palette existante
(`frontend/src/styles/index.css`, bloc `@theme`) :

| Variable | Valeur | Origine |
|---|---|---|
| `--color-brand` | `#4c1d95` | violet du monogramme |
| `--color-brand-royal` | `#6d28d9` | dégradé du monogramme |
| `--color-gold` | `#f2b544` | « CHRIST » de l'affiche |
| `--color-eagle` | `#1e73c5` | bleu de l'aigle |
| `--color-flame` | `#e0702f` | orange de la flamme |

## 3. Textes institutionnels intégrés

| Élément | Où | Modifiable ? |
|---|---|---|
| « Le Réveil par l'amour du Christ » | hero, écran de connexion, bloc identité | oui, via le slogan des paramètres |
| Vision : « Bâtir un peuple délivré, transformé par la révélation de la parole de Dieu, vivant pleinement leur héritage en Christ. » | bloc identité (valeur par défaut) | oui, champ « Vision » des paramètres |
| Ézéchiel 37.10 | citation du bloc identité | dans le code (`VisionSignature.tsx`) |

## 4. Ce qui est animé, et pourquoi

| Animation | Fichier | Détail |
|---|---|---|
| Fond en parallaxe | `AnimatedHero.tsx` | le regard du lion se déplace moins vite que le texte au défilement |
| Halos colorés | `.aurora-blob` (CSS) | trois halos violets/bleus/dorés dérivent lentement |
| Logo flottant | `.float-soft` + `.halo` | léger mouvement vertical, auréole pulsée |
| Compteurs | `useCountUp` | les chiffres (départements, prédications, rendez-vous) montent jusqu'à la **valeur réelle** de l'API |
| Messages qui tournent | `useRotatingMessage` | slogan, signature et vision se relaient sous le titre |
| Bandeau d'horaires | `.ticker-track` | défilement continu, mis en pause au survol |
| Apparition des sections | `Reveal.tsx` | chaque section se révèle une seule fois au défilement |
| Écran de connexion | `AuthShell.tsx` | entrée du panneau et du formulaire, fond animé |

### Accessibilité

- `MotionConfig reducedMotion="user"` (dans `App.tsx`) et `useReducedMotion`
  coupent les animations si le système est réglé sur « réduire les animations » ;
  les compteurs affichent alors directement leur valeur finale.
- Les décors sont `aria-hidden="true"` ; le logo a un texte alternatif explicite.
- Aucune animation ne bloque la lecture : les contenus sont présents dans le DOM
  dès le premier rendu.

### Performance

- Images optimisées : l'ensemble du dossier `brand/` pèse environ 550 Ko, dont
  250 Ko pour le seul logo complet (utilisé une fois, en chargement différé).
- Le monogramme de l'en-tête est mis en cache par le navigateur.
- Aucune animation ne s'exécute hors écran (`whileInView` + `once`).

## 5. Vérifications

```bash
npm run typecheck                     # 0 erreur
npm run test --workspace frontend     # 40/40
npm run build                         # succès
```

Tests dédiés : `frontend/src/pages/public/HomePage.test.tsx` vérifie que le
slogan, le logo officiel (`/brand/logo-mark.png`), la signature, la vision, le
verset et les chiffres réels de l'API sont bien rendus.
