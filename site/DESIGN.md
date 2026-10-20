---
name: Claude Cockpit, site de présentation
description: Le site GitHub Pages de Claude Cockpit, en Liquid Paper (Encre et Papier), thème Noir, verre liquide.
colors:
  paper-night: "#17181b"
  paper-deep: "#0f1012"
  plate-graphite: "#202125"
  plate-hover: "#2b2c31"
  ink-chalk: "#f0f0ec"
  ink-ash: "#b3b4b0"
  ink-faint: "#6a6b6f"
  line-steel: "#8a8b8f"
  rule-hairline: "rgba(240,240,236,.16)"
  accent-chalk: "#f0f0ec"
  on-accent: "#17181b"
  accent-tint: "#2d2e33"
  success: "#e2e3df"
  success-tint: "#2a2b2f"
  warning: "#cfd0cc"
  warning-tint: "#303135"
  danger: "#ffffff"
  danger-tint: "#3a3b40"
  glass: "rgba(255,255,255,.07)"
  glass-edge: "rgba(255,255,255,.16)"
typography:
  display:
    fontFamily: "Instrument Serif, Iowan Old Style, Georgia, serif"
    fontSize: "132px"
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: "-.025em"
  headline:
    fontFamily: "Instrument Serif, Iowan Old Style, Georgia, serif"
    fontSize: "42px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-.02em"
  title:
    fontFamily: "Instrument Serif, Iowan Old Style, Georgia, serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-.01em"
  title-s:
    fontFamily: "Instrument Serif, Iowan Old Style, Georgia, serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-.005em"
  lede:
    fontFamily: "Instrument Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Instrument Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  note:
    fontFamily: "Instrument Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "DM Mono, ui-monospace, SF Mono, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: ".12em"
rounded:
  none: "0"
  glass-s: "14px"
  glass: "24px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
  "24": "96px"
components:
  button-primary:
    backgroundColor: "{colors.ink-chalk}"
    textColor: "{colors.paper-night}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "16px 28px"
    height: "52px"
  button-glass:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink-chalk}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "12px 22px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-chalk}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "16px 28px"
  button-sm:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink-chalk}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
    height: "32px"
  tag:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink-chalk}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  tag-warning:
    backgroundColor: "{colors.warning-tint}"
    textColor: "{colors.warning}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  plate:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink-chalk}"
    rounded: "{rounded.glass}"
    padding: "24px"
  header:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink-chalk}"
    rounded: "{rounded.glass}"
    height: "56px"
  card-front:
    backgroundColor: "{colors.paper-night}"
    textColor: "{colors.ink-chalk}"
    rounded: "{rounded.glass-s}"
    padding: "16px"
---

# Design System: Claude Cockpit, site de présentation

<!-- Portée : le site GitHub Pages (site/, construit vers site/dist/). Le cockpit et l'île ont leurs propres écarts, documentés dans le README du dépôt. La maquette validée fait foi : docs/design/site/. -->

## Overview

**Creative North Star: "Le Tableau de bord nocturne"**

Le site se lit comme un cockpit vu de nuit. Le fond est un papier noir grainé, l'encre est une craie presque blanche, et tout ce qui se manipule est posé sous une vitre : barre de navigation flottante, plaques, boutons en pilule. Rien ne prend de couleur, sauf les cartes holographiques. Elles sont les seuls instruments allumés du tableau de bord, et c'est là que le regard doit tomber.

Le système est imposé : Liquid Paper, variante Encre et Papier, thème Noir (`data-theme="noir"`), en mode verre (aucune surface `data-surface="paper"`). Les gravures et le fond animé viennent de systems-generator (`<sg-card>`, `<sg-flip>`, `BgGen` en `metaballs-page`). Le site n'invente aucun jeton : il compose ceux du paquet avec une poignée de classes `cc-*` de mise en page.

La densité est celle d'une page éditoriale : de grands titres en Instrument Serif, des textes courts à la mesure de 46 caractères, de larges respirations entre les sections (96 px). Le ton reste calme et sûr. On montre l'objet réel (une carte vivante qu'on retourne) plutôt que de le décrire.

**Key Characteristics:**
- Monochrome strict, de la craie sur du papier noir ; la couleur n'existe que dans les gravures des cartes.
- Verre liquide sur tout ce qui est interactif ou flotte : pilules, plaques arrondies, barre détachée du bord.
- Serif éditorial pour les titres, sans-serif pour lire, mono capitales espacées pour tout ce qui est étiquette ou commande.
- Des démonstrations vivantes (cartes à retourner, sélecteur d'état) à la place des captures décoratives.
- Fidélité mesurée à la maquette validée, par test de structure et comparaison de pixels.

## Colors

Une palette sans teinte : des gris légèrement chauds, de la craie au graphite, et une couleur d'accent qui est la craie elle-même.

### Primary
- **Craie** (accent-chalk, identique à ink-chalk) : l'accent du thème Noir est l'encre. Il remplit le bouton principal et marque l'état actif. Il n'y a pas d'accent coloré, et c'est voulu.

### Neutral
- **Papier de nuit** (paper-night) : le fond de page, avec le grain et la fibre de Liquid Paper par-dessus. Sert aussi de texte sur le bouton principal et, à 86 %, de fond aux faces avant des cartes.
- **Papier profond** (paper-deep) : le fond le plus bas, sous les zones qui s'enfoncent.
- **Graphite** (plate-graphite) et **Graphite éclairé** (plate-hover) : les surfaces pleines quand le verre ne s'applique pas, et leur survol.
- **Craie** (ink-chalk) : titres et texte principal.
- **Cendre** (ink-ash) : textes secondaires, chapeaux (`ep-lede`), notes (`ep-note`), liens de navigation au repos.
- **Gris effacé** (ink-faint) : l'information la plus discrète.
- **Acier** (line-steel) : les traits de contour des contrôles en mode papier.
- **Filet** (rule-hairline) : les séparateurs, les lignes des listes de définitions, le trait haut des étapes de roadmap à venir.
- **Verre** (glass) et **Arête de verre** (glass-edge) : le remplissage translucide et le bord lumineux de tout ce qui est en verre.

### Tons d'état
Les tons d'état du thème Noir sont eux aussi des gris (success, warning, danger et leurs teintes). Ils se distinguent par l'icône et le mot du tag, jamais par la couleur.

### Named Rules
**The Lit Instrument Rule.** La couleur est réservée aux gravures holographiques des cartes (`<sg-card>`), au reflet de la carte du logo et au fond `BgGen`. Aucun texte, bouton, tag ou fond d'interface ne prend de teinte.

**The Icon and Word Rule.** Un état se lit toujours par une icône et un mot (Permission, Question, Delivered, Working). Les tons d'état sont des gris : si on retire la couleur, rien ne doit changer.

## Typography

**Display Font:** Instrument Serif (avec Iowan Old Style, Georgia, serif)
**Body Font:** Instrument Sans (avec system-ui, -apple-system, Segoe UI, sans-serif)
**Label/Mono Font:** DM Mono (avec ui-monospace, SF Mono, Consolas, monospace)

**Character:** Un serif de magazine, haut et serré, qui donne aux titres une voix humaine, face à un mono technique en capitales espacées qui parle comme un instrument de bord. Le sans-serif se tient entre les deux et sert à lire.

### Hierarchy
- **Display** (400, 132 px, interligne 0.9, -0.025 em ; 52 px sur téléphone) : le seul titre du héros, sur toute la largeur et en deux lignes au plus. Sa chute passe en italique (`<em>at a glance</em>`).
- **Headline** (400, 42 px, interligne 1, -0.02 em) : un titre par section (`h2`).
- **Title** (400, 30 px, interligne 1.1) : les sous-parties d'une section (`h3`), et le titre de l'appel final.
- **Title S** (400, 22 px, interligne 1.15) : titres de plaques, d'étapes, de jalons (`h4`), et le nom de l'état courant.
- **Lede** (400, 16 px, interligne 1.55, couleur Cendre) : une phrase d'introduction sous un titre, limitée à 46 caractères de large.
- **Body** (400, 15 px, interligne 1.55) : le texte courant.
- **Note** (400, 16 px, couleur Cendre) : descriptions sous les figures et dans les plaques, mentions de compatibilité. Seules les faces avant des cartes gardent la note Liquid Paper de 14 px.
- **Label** (500, 11 px, +0.12 em, CAPITALES) : navigation, boutons, tags, légendes de figures, pied de page.

### Named Rules
**The Two Voices Rule.** Le serif parle, le mono commande. Un titre n'est jamais en mono, un bouton ou un tag n'est jamais en serif.

**The One Display Rule.** La taille Display ne sert qu'au titre du héros et à la signature du bas de page (le logo et « Claude Cockpit », masqués aux lecteurs d'écran).

**The Two Lines Rule.** Aucun titre, du héros aux plaques, ne dépasse deux lignes, à 1440 comme à 390 px, en anglais comme en français. On raccourcit le texte avant de toucher à la taille. Un test le vérifie avec les vraies polices.

## Layout

Une colonne centrée (`ep-wrap`) de 1240 px au plus, avec des marges latérales fluides de 16 à 56 px. Les sections se suivent à 96 px d'écart (64 px sous 900 px). Les chapeaux restent à 46 caractères de large.

- **Héros** : posé directement sur le fond animé, sans bloc. Le titre court sur toute la largeur ; en dessous, deux colonnes (1.25 / 1) alignées en haut : phrase d'appui, actions et mention à gauche, carte vivante à droite (326 px au plus), 48 px d'écart. Le titre, la phrase d'appui, les actions et la carte sont dans le premier écran à 1440 × 900.
- **Bloc de contenu** : tout ce qui suit le héros est dans un seul bloc de verre centré (`main > .ep-wrap.ep-glass`, arrondi 24 px), 12 px de marge latérale sous 900 px. Le fond animé reste visible dans les marges et flouté à travers le verre.
- **Grilles** : 4, 3 ou 2 colonnes égales avec 24 px de gouttière. Sous 900 px, les grilles de 4 et de 3 passent à 2 ; sous 560 px, tout passe à une colonne.
- **Bande des gravures** : une rangée de sept cartes d'au moins 134 px ; sous 900 px elle passe à la ligne (4 colonnes, puis 2 sous 560 px) au lieu de déborder de l'écran.
- **Développeurs** : trois colonnes de texte sans plaques, pour ne pas répéter la rangée de plaques de l'installation.
- **Roadmap** : six étapes en ligne, puis trois sous 900 px, puis une seule.
- **Ancres** : le défilement s'arrête sous la barre flottante (hauteur de barre + 32 px, le double de la barre sous 900 px quand la navigation passe à la ligne).
- Toutes les valeurs passent par l'échelle d'espacement de Liquid Paper (`--space-*`), jamais par des pixels écrits à la main.

### Named Rules
**The Mockup First Rule.** Toute évolution qui change la mise en page passe d'abord par une nouvelle maquette validée dans `docs/design/site/`. Le test de structure et la comparaison visuelle à 1440 et 390 px font respecter la maquette en vigueur.

## Elevation & Depth

La profondeur vient du verre : des surfaces translucides floutées et saturées par-dessus le fond animé, avec un reflet en diagonale et une arête claire. Les ombres, longues et sombres, ne servent qu'à décoller ce verre du papier. Rien n'est plat en mode verre, et rien n'empile plus de deux niveaux.

### Shadow Vocabulary
- **Verre** (`box-shadow: 0 18px 44px -14px rgba(0,0,0,.72), 0 2px 6px rgba(0,0,0,.4)`) : plaques et barre de navigation.
- **Verre léger** (`box-shadow: 0 8px 18px -10px rgba(0,0,0,.7)`) : boutons au repos.
- **Verre en avant** (`box-shadow: 0 32px 70px -22px rgba(0,0,0,.85), 0 3px 8px rgba(0,0,0,.5)`) : ce qui passe au-dessus du reste.
- **Plaque papier** (`box-shadow: 0 1px 0 rgba(255,255,255,.05) inset, 0 22px 34px -24px rgba(0,0,0,.85), 0 2px 3px rgba(0,0,0,.45)`) : les plaques pleines hors verre.

### Named Rules
**The Glass Over Paper Rule.** Le verre flotte toujours au-dessus du papier grainé et du fond `BgGen`. On ne pose pas de verre sur du verre, sauf les tags et les boutons à l'intérieur d'une plaque.

## Shapes

Deux familles de formes. Tout ce qui est en verre est arrondi : la pilule (999 px) pour les boutons et les tags, l'arrondi large (24 px) pour les plaques, la barre de navigation, le bloc de contenu et le sélecteur d'état (une pilule sur deux lignes couperait ses boutons), l'arrondi moyen (14 px) pour la face avant des cartes. Tout ce qui relève du papier reste à angle vif (0 ou 2 px) : filets, listes de définitions, traits de roadmap. Les cartes gardent la silhouette fixée par systems-generator.

## Components

### Buttons
Des pilules de verre, tactiles et sûres d'elles, avec un léger rebond au survol.
- **Shape :** pilule (999 px).
- **Primary :** fond Craie, texte Papier de nuit, 52 px de haut en taille `lg`. Un seul par vue : « Download for Windows » dans le héros, puis dans l'appel final.
- **Verre (défaut) :** remplissage translucide, arête claire, ombre légère, 40 px de haut.
- **Ghost :** transparent jusqu'au survol (« Source on GitHub », « Report an issue », « Always »).
- **Small :** 32 px de haut, pour les réponses rapides dans les faces avant des cartes (Deny, Allow, OK, GO, No).
- **Hover / Focus :** le verre se renforce et l'ombre grandit (0.2 s, `cubic-bezier(.3, 1.35, .45, 1)`). Le focus clavier est un contour Craie de 2 px. Avec `prefers-reduced-motion`, aucune transition.

### Chips
Les tags (`ep-tag`) : mono 11 px en capitales, pilule de verre. Les variantes d'état (success, warning, info, danger) ajoutent une icône de 11 px et leur teinte grise ; `ep-tag--accent` marque la vision.

### Cards / Containers
- **Corner Style :** arrondi large (24 px) en verre.
- **Background :** verre renforcé, flouté et saturé, reflet diagonal.
- **Shadow Strategy :** ombre Verre (voir Elevation & Depth).
- **Border :** arête de verre de 1 px.
- **Internal Padding :** 24 px (`ep-plate--pad`).
- **Head :** titre de plaque à gauche, tag à droite (`ep-plate__head`), par exemple « Privacy / Local first ».

### Navigation
Une barre de verre détachée du bord (12 px en haut et sur les côtés, arrondi 24 px, 56 px de haut), collante au défilement. À gauche le logo (`.cc-mark` 32 px) et « Claude Cockpit » en serif 24 px, à droite cinq liens en mono capitales, Cendre au repos, Craie au survol. Le dernier lien bascule vers la version française. Sous 900 px, la navigation passe sur sa propre ligne et défile horizontalement sans barre visible.

### Logo
Une main de trois cartes en éventail (`.cc-mark`, SVG en ligne de 32 × 32). Les deux cartes du fond sont dessinées à l'encre, remplies de la couleur de la surface (`--mark-bg`). La carte du dessus porte le reflet holographique des cartes, en dégradé des couleurs de séries du thème sombre (#9ba8ff, #4fc3cf, #e0b04a, #d4558a), avec un trait de lumière. C'est le seul point de couleur hors des cartes : il dit « cartes holographiques » dès l'en-tête. Trois usages : la barre de navigation (32 px), la signature du bas de page (96 px, avec le nom en Display, qui passe sous le logo sur téléphone) et le favicon (`favicon.svg`, couleurs fixes, lisible sur onglet clair ou sombre).

### Carte vivante (signature)
L'objet central du site : une `<sg-card>` (gravure, finition, rareté, état) dans un `<sg-flip>` qui se retourne au clic, à Entrée ou à Espace. Le dos montre la gravure et le titre ; la face avant (`cc-front`, Papier de nuit à 86 %, arrondi 14 px, 16 px de marge) montre un tag d'état, la demande en clair, les réponses rapides et une note. Chaque carte retournable porte `role="button"` et un `aria-label` qui dit son état et l'action. Les seeds sont fixes pour que le rendu soit le même à chaque visite. La face avant est opaque à 86 % : la gravure du dos reste visible au travers, c'est voulu. Elle contient toujours sa demande et ses réponses sans défilement, un test le vérifie.

### Sélecteur d'état
Un `ep-toggle` de verre (arrondi 24 px) avec sept boutons mono (Working, Waiting, Permission, Delivered, Blocked, Later, Rest), qui passent à la ligne quand la place manque. Le bouton actif porte `aria-pressed="true"` et passe en verre renforcé. Il change l'attribut `state` de la carte voisine, et le nom et la description de l'état affichés en dessous, dans la langue de la page.

### Entrées des sections
Quand le mouvement est permis, les parties de chaque section (titre, texte, plaques, jalons ; jamais les cartes, qu'un fondu aplatirait en 3D) montent de 24 px en fondu, l'une après l'autre (70 ms d'écart, 0,6 s, `cubic-bezier(.2,.8,.2,1)`), une seule fois, à leur entrée à l'écran. L'état caché n'existe que sous `prefers-reduced-motion: no-preference` et que si le script tourne : sans script ou en mouvement réduit, rien n'est jamais masqué.

### Jalons de roadmap
Des étapes posées sur un filet de 2 px en haut : Filet pour ce qui est à venir, Cendre pour ce qui est livré (`data-done`). Chacune porte un tag (Shipped, Next, Later, Vision), un titre Title S, une note et des liens vers les issues. La liste est générée depuis les jalons GitHub au build.

### Plaques de capture en attente
Des plaques de verre au format 16/10, avec un tag « Screenshot pending » et une note qui décrit la capture attendue. Elles seront remplacées par les vraies captures de l'île (`docs/media/`), au même format.

## Do's and Don'ts

### Do:
- **Do** utiliser uniquement les jetons et composants de Liquid Paper (`--space-*`, `--radius-*`, `ep-*`), avec des classes `cc-*` réservées à la mise en page.
- **Do** garder `data-theme="noir"` et le mode verre sur toute la page.
- **Do** garder un seul bouton principal par vue, avec le même libellé « Download for Windows ».
- **Do** montrer une carte vivante et retournable chaque fois qu'on parle d'une conversation, plutôt qu'une capture ou une illustration.
- **Do** donner à chaque élément retournable `tabindex="0"`, `role="button"`, un `aria-label` explicite, et le retournement à Entrée et à Espace.
- **Do** respecter `prefers-reduced-motion` : fond `BgGen` figé, `ep-flow-type` sans animation, aucune transition de bouton, aucune entrée de section.
- **Do** garder chaque titre en deux lignes au plus, à toutes les largeurs et dans les deux langues.
- **Do** faire passer tout changement de mise en page par une nouvelle maquette validée dans `docs/design/site/`, puis mettre à jour les tests.

### Don't:
- **Don't** ajouter de couleur à l'interface : pas d'accent bleu, pas de dégradé coloré, pas de texte ou de fond teinté. La couleur reste dans les cartes.
- **Don't** signaler un état par la couleur seule ; toujours l'icône et le mot.
- **Don't** créer de jeton, de police, de rayon ou d'ombre en dehors de Liquid Paper, ni écrire des pixels à la main là où une valeur `--space-*` existe.
- **Don't** utiliser la taille Display ailleurs que dans le héros, ni mettre un titre en mono ou un bouton en serif.
- **Don't** mélanger verre et papier sur une même page (pas de `data-surface="paper"`), ni empiler du verre sur du verre au-delà des tags et boutons dans une plaque.
- **Don't** inventer de témoignage, de chiffre d'usage, de logo client ou de citation de presse.
- **Don't** mettre de tiret cadratin dans les textes.
- **Don't** modifier les fichiers Liquid Paper copiés (`ds/encrepapier/`) ni ceux de systems-generator (`vendor/`) ; ils viennent de leurs paquets et Liquid Paper est exclu de la licence MIT.
