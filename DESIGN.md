---
name: Claude Cockpit, l'app
description: L'app de bureau Claude Cockpit (île, lanceur, fenêtre cockpit), en Liquid Paper thème Nuit sur verre acrylique Windows.
colors:
  paper-night: "#121316"
  paper-deep: "#0c0d0f"
  plate-slate: "#1b1c20"
  plate-hover: "#25262b"
  ink-bone: "#ecece6"
  ink-mist: "#a5a8ae"
  ink-faint: "#5f6268"
  line-pewter: "#7a7d84"
  rule-hairline: "rgba(236,236,230,.16)"
  accent-periwinkle: "#9ba8ff"
  accent-strong: "#c3cbff"
  on-accent: "#121316"
  accent-tint: "#262b4d"
  success-lagoon: "#4fc3cf"
  success-tint: "#123136"
  warning-amber: "#e0b04a"
  warning-tint: "#38300f"
  danger-coral: "#ff8a80"
  danger-tint: "#3d1f1d"
  glass: "rgba(34,36,44,.40)"
  glass-edge: "rgba(255,255,255,.14)"
  paper-day: "#e7e7e2"
  plate-day: "#f0f0ec"
  ink-day: "#17181b"
  ink-day-2: "#55585e"
typography:
  display:
    fontFamily: "Instrument Serif, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(40px, 6vw, 56px)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-.02em"
  headline:
    fontFamily: "Instrument Serif, Iowan Old Style, Georgia, serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-.01em"
  title:
    fontFamily: "Instrument Serif, Iowan Old Style, Georgia, serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-.005em"
  body:
    fontFamily: "Instrument Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  body-s:
    fontFamily: "Instrument Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Instrument Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.35
  eyebrow:
    fontFamily: "Instrument Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: ".07em"
  caption:
    fontFamily: "Instrument Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  figure:
    fontFamily: "DM Mono, ui-monospace, SF Mono, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  none: "0"
  glass-s: "14px"
  glass: "24px"
  pill: "999px"
  round: "50%"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  island-compact:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink-bone}"
    rounded: "{rounded.pill}"
    width: "320px"
  island-open:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink-bone}"
    rounded: "{rounded.glass}"
    width: "800px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-mist}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
  tab-active:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink-bone}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
  quick-reply:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink-bone}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "32px"
  status-pill-waiting:
    backgroundColor: "{colors.warning-tint}"
    textColor: "{colors.warning-amber}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  status-pill-done:
    backgroundColor: "{colors.success-tint}"
    textColor: "{colors.success-lagoon}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  icon-button:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink-bone}"
    rounded: "{rounded.round}"
    size: "32px"
  search-field:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink-bone}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "52px"
  conversation-card:
    backgroundColor: "{colors.plate-slate}"
    textColor: "{colors.ink-bone}"
    rounded: "{rounded.glass-s}"
---

# Design System: Claude Cockpit, l'app

<!-- Portée : l'app de bureau Electron (Windows). Trois surfaces : l'île (`?island=1`), le lanceur (`?launcher=1`, Alt+Espace) et la fenêtre cockpit de l'app (`?glass=1`). Toutes sont rendues par la page unique `mod/assets/conversations.html` et `mod/assets/island*.js`, dans les fenêtres de `desktop/main.js`. Hors portée : l'assistant d'installation et la version web servie sans `?glass=1`, appelée à disparaître. Le site GitHub Pages a son propre `site/DESIGN.md`. Les écarts détaillés de l'île au modèle sont consignés dans `README.fr.md` (« Écarts au modèle Liquid Paper ») ; ce fichier en donne les règles. -->

## Overview

**Creative North Star: "La Main de cartes"**

Chaque conversation est une carte, et l'app est la main qui les tient. La carte porte tout ce qui distingue une conversation d'une autre : sa gravure générative (systems-generator, rendue en WebGPU), sa finition, sa rareté gagnée par le travail, son état en direct. Tout le reste de l'interface est la table : du verre acrylique de Windows, de la craie, des libellés sobres en sans-serif, qui s'effacent derrière les cartes et le texte. On regarde les cartes ; on touche le verre.

Le système est imposé : Liquid Paper 2.1.0 (`mod/assets/liquid-paper/`, copie du paquet `@code-my-life/liquid-paper`), variante Encre et Papier, thème Nuit (`data-theme="dark"`). L'île change de thème toute seule selon le bureau derrière elle : Nuit sur un bureau sombre, Papier sur un bureau clair (lecture de quelques pixels de l'écran, avec hystérésis). Le verre n'est pas du CSS : c'est l'acrylique de Windows, et la fenêtre de l'île EST la forme qui se morphose.

L'app vit au bord de l'attention : on travaille dans d'autres fenêtres, l'île porte l'urgence en haut de l'écran, le cockpit sert à faire le point. Le ton est donc calme et précis, sans décor, avec une seule promesse : personne n'attend en silence. Les composants sont **tactiles et discrets** : du verre qu'on a envie de toucher (pilules, ressort court, pression à 97 %), mais qui laisse la place aux cartes.

**Key Characteristics:**
- La carte holographique est l'unité de tout : dans l'île (pile), le cockpit (grandes cartes, mini-cartes de l'équipe) et le lanceur.
- Verre acrylique du système sous tout ce qui flotte ; aucun `backdrop-filter` dans l'île.
- Craie sur Nuit, ou encre sur Papier quand le bureau est clair, choisi par l'app et non par l'utilisateur.
- Couleur réservée aux cartes et aux états (ambre qui attend, lagune livré, corail bloqué, pervenche en mission).
- Serif éditorial pour les noms, sans-serif pour lire et pour les libellés, mono pour les chiffres, les chemins et le code.
- Mouvement court et physique (ressort 260 à 300 ms pour le verre, 150 ms pour le contenu), coupé en mouvement réduit.

## Colors

Une palette froide et sourde, d'où ne ressortent que les cartes et quatre couleurs d'état.

### Primary
- **Pervenche** (accent-periwinkle) : l'accent du thème Nuit. Ce qui travaille (« En mission ») et l'information. **Pervenche vive** (accent-strong) pour le survol et la pression ; **Nuit de pervenche** (accent-tint) en fond de tag.

### Tons d'état
- **Ambre** (warning-amber, sur warning-tint) : ce qui t'attend, question ou permission. La couleur la plus importante de l'app : c'est elle que l'œil doit trouver dans l'île repliée.
- **Lagune** (success-lagoon, sur success-tint) : mission livrée, terminé.
- **Corail** (danger-coral, sur danger-tint) : bloqué, en erreur.

### Neutral
- **Papier de nuit** (paper-night) : le fond du cockpit et de la page hors ligne. **Papier profond** (paper-deep) : ce qui s'enfonce.
- **Ardoise** (plate-slate) et **Ardoise éclairée** (plate-hover) : les surfaces pleines quand le verre manque (sans flou du système, plaque à 94 %), et leur survol.
- **Os** (ink-bone) : texte principal et titres. **Brume** (ink-mist) : texte secondaire et libellés au repos ; dans l'île, il passe à 92 % d'encre pour tenir le contraste sur l'acrylique. **Gris effacé** (ink-faint) : le plus discret.
- **Étain** (line-pewter) et **Filet** (rule-hairline) : contours des contrôles et séparateurs.
- **Verre** (glass) et **Arête de verre** (glass-edge) : remplissage et bord de tout ce qui est en verre.

### Thème Papier (île sur bureau clair)
**Papier de jour** (paper-day), **Plaque de jour** (plate-day), **Encre** (ink-day) et **Encre seconde** (ink-day-2), avec les tons d'état Papier du modèle (accent #2432a8, lagune #0b6a73, ambre #7a4f00, corail #b3261e). Teinte acrylique claire de 25 %, contre 16 % en Nuit.

### Named Rules
**The Cards Are Lit Rule.** La couleur vive vit dans les gravures des cartes. L'interface autour n'a que les quatre tons d'état, et seulement là où un état est dit.

**The Amber Means You Rule.** L'ambre veut dire « toi » : une question ou une permission qui attend. Il n'est jamais décoratif, jamais utilisé pour autre chose, et il reste visible île repliée.

**The Icon and Word Rule.** Un état se lit toujours par une icône et un mot (« T'ATTEND », « TERMINÉ », « TRAVAILLE ») : jamais par la couleur seule.

**The Measured Contrast Rule.** Sur l'acrylique, le contraste se mesure contre le bureau réel : encre à 11:1 au moins sur bureau sombre, 9,7:1 sur bureau clair (AA visé). Une teinte ou une opacité se règle par la mesure, pas à l'œil.

## Typography

**Display Font:** Instrument Serif (avec Iowan Old Style, Georgia, serif)
**Body Font:** Instrument Sans (avec system-ui, -apple-system, Segoe UI, sans-serif)
**Mono Font:** DM Mono (avec ui-monospace, SF Mono, Consolas, monospace), réservé aux chiffres et au code

**Character:** Le serif nomme (l'équipe, une conversation, une carte), le sans-serif se lit et dit l'état, le mono compte (âges, messages, chemins, code). Trois voix, chacune à sa place.

### Hierarchy
- **Display** (400, 40 à 56 px, interligne 1) : « Ton *équipe* », le seul grand titre du cockpit. L'horloge (34 px, chiffres tabulaires) l'accompagne.
- **Headline** (400, 30 px) : les sections du cockpit (Attendent tes ordres, En mission, Mis de côté).
- **Title** (400, 22 px ; 18 px dans la pile de l'île) : le nom d'une conversation, sur la carte et dans l'île.
- **Body** (400, 15 px, interligne 1.55) : les résumés, la conversation, les champs. **Body S** (400, 13 px) : le corps des faces de cartes de l'île.
- **Label** (500, 13 px, sans-serif, casse de phrase) : onglets, boutons, pastilles d'état, libellés de champ et de statistique.
- **Eyebrow** (500, 12 px, sans-serif, +0.07 em, CAPITALES) : le seul texte en capitales, au-dessus d'un groupe (titre de dépôt, sous-titre de fiche).
- **Caption** (400, 12 px, sans-serif, chiffres tabulaires) : métadonnées (nombre de messages, ligne de statistiques, fraîcheur).
- **Figure** (400, 12 px, DM Mono) : chiffres seuls, âges, chemins, code.

### Named Rules
**The Three Voices Rule.** Un nom est en serif, une phrase, un libellé ou un état en sans-serif, un chiffre, un chemin ou du code en mono. Ne jamais les échanger.

**The Tracking Follows Case Rule.** L'espacement large (+0.07 em) n'existe que sur le sur-titre en CAPITALES. Tout le reste garde l'espacement naturel de sa police. Le CSS ne passe rien d'autre en capitales, et le texte source est en casse de phrase.

## Layout

- **L'île** : une fenêtre qui est la forme. Repliée, une pastille de 320 px collée au bord haut (état, puis les mini-cartes qui attendent). Ouverte, 800 px au plus, en deux colonnes : à gauche la pile de cartes avec la conversation au premier plan (réponse rapide sous la carte) ; à droite « Autres conversations » et les boutons ronds d'action. Les toasts se posent sous la forme (`--dock-room`), la fenêtre s'agrandit le temps qu'ils sont là.
- **Le lanceur** : une barre de recherche pleine largeur (640 px), qui s'allonge vers le bas pour ses résultats, collée en haut de l'écran.
- **La fenêtre cockpit** : 1180 × 900 px par défaut, une colonne de 900 px au plus. En tête : titre, statistiques du jour, outils (nouvelle conversation, Liste ou Équipe, A- et A+, horloge), l'équipe en mini-cartes, la recherche. Puis les sections dans l'ordre de l'urgence : ce qui attend, ce qui travaille, ce qui est mis de côté, puis le repos replié.
- Toutes les valeurs passent par l'échelle `--space-*` de Liquid Paper. L'île corrige localement les règles étroites du modèle (sous 900 px), qu'elle remet en colonne.

### Named Rules
**The Urgency Order Rule.** Partout, ce qui attend passe en premier : section du haut dans le cockpit, carte du dessus dans la pile, pastille ambre dans l'île repliée.

## Elevation & Depth

Trois profondeurs, pas plus. Le verre acrylique de Windows est le plan du fond (le bureau flou derrière l'île, le lanceur et la fenêtre cockpit). Les plaques et les cartes posées dessus forment le deuxième plan, avec l'ombre Verre de Liquid Paper. Les pastilles, onglets et boutons de verre sont le troisième, avec l'ombre légère. Dans l'île, la page ne pose que la teinte de la conversation (8 %, 6 % en Papier) et les reflets ; jamais de `backdrop-filter`, jamais d'`opacity` sur le bloc de verre.

### Shadow Vocabulary
- **Verre** (`box-shadow: 0 18px 44px -14px rgba(0,0,0,.72), 0 2px 6px rgba(0,0,0,.4)`) : plaques, barre de recherche, cartes.
- **Verre léger** (`box-shadow: 0 8px 18px -10px rgba(0,0,0,.7)`) : boutons, onglets, pastilles.
- **Verre en avant** (`box-shadow: 0 32px 70px -22px rgba(0,0,0,.85), 0 3px 8px rgba(0,0,0,.5)`) : ce qui passe devant le reste (popup de l'équipe, carte agrandie).

### Named Rules
**The Window Is the Glass Rule.** Dans l'île, le flou vient de Windows et la fenêtre a la forme exacte de la pastille ou de l'île ouverte. On ne simule pas le verre en CSS par-dessus.

## Shapes

Tout ce qu'on touche est arrondi : la pilule (999 px) pour la pastille repliée, les onglets, les boutons, les pastilles d'état et la recherche ; le rond (50 %) pour les boutons à icône seule et les identités ; l'arrondi large (24 px) pour l'île ouverte et les plaques ; l'arrondi moyen (14 px) pour les cartes et les bulles. Les coins de la fenêtre de l'île sont ceux de Windows 11 (8 px), y compris en haut : un écart subi, documenté dans le README.

## Components

### Île repliée
Une pastille de verre de 320 px collée au bord haut : la pastille d'état (« ⚠ 2 T'ATTENDENT » en ambre, ou « PERSONNE AU TRAVAIL ») puis les mini-cartes des conversations qui attendent. Elle s'ouvre au clic, au survol ou au raccourci, par une morphose de la fenêtre (ressort de 300 ms à l'ouverture, 260 ms au repli, contenu en 150 ms après 110 ms).

### Île ouverte
- **Onglets** (Accueil, Envoyer un ordre, Nouvelle conversation) : une pilule de verre, l'onglet actif en verre renforcé ; flèches gauche et droite entre eux, Échap pour replier.
- **Pile de cartes** : la conversation au premier plan est une carte holographique retournée sur sa face d'action : titre, pastille d'état avec âge, messages et temps actif, bouton Détails, l'alerte de ce qui est attendu, le champ de réponse avec son bouton d'envoi rond, puis les réponses rapides OK, GO, Non. Les cartes suivantes sont empilées dessous.
- **Autres conversations** : une ligne par conversation, mini-carte, titre, pastille d'état à droite.
- **Boutons ronds** (recherche, cockpit, sons, quitter) : 32 px, icône seule, infobulle Encre et Papier (`data-ep-tip`) et nom accessible.
- **Replier Échap** : bouton de verre avec sa touche en pilule.

### Lanceur
Une barre de recherche en verre (« Rechercher dans toutes les conversations »), puis « CONVERSATIONS RÉCENTES » et les résultats, qui s'ouvrent dans la conversation. Il se cache dès qu'il perd le focus.

### Fenêtre cockpit
- **Barre d'outils** : bouton rond « + » (nouvelle conversation), bascule Liste et Équipe en pilule, A- et A+ (zoom de 100 à 130 %), horloge en serif.
- **Équipe en mini-cartes** : une mini-carte par conversation active, avec son nombre de messages ; survol : la carte monte de 3 px en 150 ms.
- **Recherche** : un champ de verre pleine largeur, Ctrl+K.
- **Cartes de conversation** : grandes cartes holographiques (gravure, état en haut à gauche, âge en haut à droite, nom en serif, dépôt et rareté en bas), regroupées par section dans des plaques de verre.

### Carte holographique (signature)
`<sg-card>` de systems-generator : gravure générative tirée de l'identifiant de la conversation (elle garde toujours la même), finition, rareté gagnée (commune, peu commune, rare, mythique), état en direct. Elle se retourne pour agir (`<sg-flip>`). Sa face avant contient toujours sa demande et ses réponses sans défiler.

### Pastilles d'état
Pilule en sans-serif, casse de phrase, avec icône : « ⚠ T'attend » ambre, « ✓ Terminé » lagune, « ▶ Travaille » sur verre, bloqué en corail.

### Identités et sons
Les entités génératives (`mod/assets/entity/`) et leurs réactions (attente, terminé, bloqué, survol, pression) ; les sons synthétisés par identité (appel, permission, terminé, erreur), coupables d'un geste. Règles précises dans `README.fr.md`.

## Do's and Don'ts

### Do:
- **Do** passer par les jetons et composants de Liquid Paper (`--space-*`, `--radius-*`, `ep-*`) ; les seuls jetons locaux sont la teinte de conversation, `--motion-ui` et les réglages de verre de l'île.
- **Do** faire de la carte holographique l'objet de chaque conversation, partout où elle apparaît.
- **Do** dire chaque état par une icône et un mot, et garder l'ambre pour ce qui attend l'utilisateur.
- **Do** mesurer les contrastes sur l'acrylique contre un bureau clair et un bureau sombre réels.
- **Do** couper toute animation en mouvement réduit en gardant l'état final, et arrêter les boucles quand l'île est cachée.
- **Do** donner un nom accessible et une infobulle à chaque bouton à icône seule, et garder Tab, les flèches et Échap dans l'île.
- **Do** consigner tout nouvel écart au modèle Liquid Paper dans `README.fr.md`.

### Don't:
- **Don't** poser de `backdrop-filter` dans l'île, ni d'`opacity` sur le bloc de verre : le verre est celui de Windows.
- **Don't** colorer l'interface hors des quatre tons d'état : pas d'accent décoratif, pas de dégradé hors des cartes.
- **Don't** remettre un libellé en mono ou en capitales : le mono est réservé aux chiffres et au code, les capitales au sur-titre.
- **Don't** voler le focus ni ouvrir l'île pour ce qui n'attend pas l'utilisateur.
- **Don't** modifier les fichiers copiés de Liquid Paper (`mod/assets/liquid-paper/`) ni de systems-generator : on met à jour la copie depuis le paquet.
- **Don't** mettre de tiret cadratin dans les textes de l'interface.
