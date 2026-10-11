# Claude Cockpit

Un cockpit pour suivre toutes tes conversations Claude Code (onglet Code de Claude Desktop) : qui t'attend, qui travaille, qui est bloqué. Tu réponds sans ouvrir l'app.

Trois morceaux :

- **Le mod** (`mod/`) : un mod Claude Code chargé par chaque conversation. Il publie son statut, demande à Haiku une reformulation simple de la dernière réponse, compte les messages, et fait tourner un petit serveur local (`http://127.0.0.1:48123/`).
- **Le cockpit** : la page servie par ce serveur. Deux vues, « Liste » et « Équipe ».
- **L'île** (`desktop/`) : une petite application Electron qui pose une forme de verre au bord haut de l'écran, avec les entités vivantes de tes conversations, toujours au-dessus des autres fenêtres.

## Ce que ça fait

- **Identité générative animée** pour chaque conversation : un volume tiré de son identifiant (chrome, ruban torsadé, sections de coque, bande de Möbius) dessiné à l'encre noire du Systems Kit (lavis et hachures), sur un fond de verre teinté d'une couleur unique parmi 24, toujours le même pour une conversation, qui bouge plus vite quand elle t'attend et presque plus quand elle est au repos.
- **Style Liquid Paper, thème Nuit** : verre sur un fond génératif dans le navigateur, vrai flou de Windows 11 dans les fenêtres de bureau (l'île et cockpit), Instrument Serif pour les titres, DM Mono pour les étiquettes. Les fichiers du design system sont copiés dans `mod/assets/liquid-paper/`.
- **Statut en direct** de chaque conversation : t'attend (permission, question, mission livrée), en mission, en attente d'une PR ou d'une CI, bloquée, plus tard, au repos.
- **Résumé en clair** : Haiku reformule la dernière réponse de Claude en langage simple, avec la réponse exacte à côté.
- **Répondre depuis le cockpit** : OK / GO / Non en un clic, ou un message libre (images collées acceptées).
- **Mettre de côté** une conversation : « bloquée » ou « plus tard », avec une raison.
- **Terminal** ouvert directement dans le dépôt de la conversation.
- **Nouvelle conversation** : choix du ou des dépôts et premier message. Claude s'ouvre avec le message prérempli, il reste à appuyer sur Entrée.
- **Chiffres** par conversation (messages, temps de travail actif, outils lancés, fichiers modifiés) et du jour (messages envoyés, temps de réponse médian).
- Un peu de jeu : relances du jour, record, combos.

## Prérequis

- Windows, Claude Desktop avec l'onglet Code. macOS et Linux : le cockpit et l'île ne plantent plus (flou natif remplacé par le verre CSS, terminal et dossier des sessions adaptés au système), mais l'installation, les dossiers de dépôts et les résumés ne sont pas encore portés
- Node.js 20 ou plus (`node -v`)
- Chrome ou Edge

## Développement

```bash
npm test
```

Les tests tournent sur Windows, macOS et Linux dans GitHub Actions.

## Installation

```powershell
git clone https://github.com/code-my-life/claude-cockpit.git $HOME\source\repos\claude-cockpit
cd $HOME\source\repos\claude-cockpit
.\install.ps1
```

Le script :

1. déclare le mod dans `~/.claude/settings.json` (variable `CLAUDE_CODE_PLUGIN_DIRS`, bloc `env`) après avoir copié l'ancien fichier en `settings.json.avant-cockpit` ;
2. installe Electron pour l'île (environ 110 Mo téléchargés) ;
3. pose deux raccourcis sur le bureau : « Conversations Claude » (le cockpit) et « Mini équipe ».

Redémarre ensuite Claude Desktop : chaque conversation charge le mod à son démarrage.

## Utilisation

- **Conversations Claude** ouvre le cockpit. le bouton « + » en haut pour une nouvelle conversation, « Liste / Équipe » pour changer de vue, A− / A+ pour la taille du texte, la cloche pour les notifications du système.
- **Recherche globale** : le champ en haut du cockpit (Ctrl+K, ou la loupe de l'île) cherche dans tes messages et les réponses de Claude de toutes les sessions, sans tenir compte des accents ; un clic ouvre la conversation dans l'app. L'index vit en mémoire dans le serveur du cockpit, repris de `search-cache.json` au démarrage.
- **L'île** est une pièce de verre collée au bord haut de l'écran, au centre. **Réduite** : l'entité vivante de la conversation la plus urgente, un tag d'état (icône et mot, « 2 t'attendent » quand plusieurs attendent) et les petites entités des autres. **Ouverte** : au survol (intention de 120 ms ; repli 0,6 s après le départ du pointeur) ou au clic, la même forme s'étire (la forme mène, le contenu suit 110 ms plus tard) sur trois onglets : Accueil (la conversation focalisée à gauche, grande entité, nom, état, dernière question ou fil d'activité, une action principale ; les autres à droite, cliquables), Envoyer un ordre (Entrée envoie, images collées acceptées), Nouvelle conversation (dépôts, première demande). **T'attend** : l'île s'ouvre toute seule sur la question, avec une réponse rapide (OK, GO, Non ou un texte) branchée sur l'envoi réel du cockpit ; « Plus tard » ou Échap la replie sans répondre, la pastille garde le signal. **Fil d'activité** : le mod note chaque outil d'une conversation (`mod/hooks/activity.mjs`) : le fichier lu ou modifié, avec ses lignes ajoutées et retirées, la commande lancée, la recherche ; il garde les 5 dernières étapes du tour et le texte du diff des 3 dernières modifications (2 000 caractères au plus de chaque côté), pour que le store partagé reste petit. L'île affiche les 3 dernières ; un clic sur un fichier modifié ouvre son diff sous la carte (lignes retirées marquées −, ajoutées +), « Fermer » le replie. **Autorisation** : quand l'app tourne, le mod relaie chaque demande de permission de Claude (hook `classic.PermissionRequest`) au guichet de l'app (`mod/assets/permission-desk.mjs`, en mémoire, 50 demandes au plus, 10 minutes de vie) ; l'île s'ouvre dessus avec la commande ou le fichier visé et trois décisions : Refuser, Autoriser (action principale), Toujours (seulement quand Claude propose une règle, qu'elle enregistre). Les boutons ignorent les clics pendant 600 ms après l'arrivée d'une demande, et le focus clavier va sur Refuser. **Claude Desktop** ne passe pas par le hook `PermissionRequest` (sa propre fenêtre décide) : pour ses conversations, l’île tranche au niveau de `tool.check`, avant que Desktop n’affiche sa demande ; « Dans Claude » lui rend la main, et sans réponse en 30 s Desktop affiche sa fenêtre (pendant ce temps Desktop montre seulement l’outil « en cours » : la carte de l’île l’écrit en clair, avec un compte à rebours). Toujours n’y est pas proposé (aucune règle à enregistrer à ce niveau). Dans le terminal, cohabitation avec coucou ou tout autre hook : le mod pose la demande à l'île et laisse en même temps les autres hooks s'exécuter ; la première réponse gagne, l'autre côté retire la demande. Sans réponse de l'île en 110 s, la demande revient à Claude. Elle se cache après 60 s sans activité ; pose le curseur 0,2 s au bord haut de l'écran, ou attends qu'une conversation bouge, pour la faire revenir. Tant qu'une conversation t'attend elle reste là ; pour une mission livrée, 3 minutes au plus. « Détails » (accueil) donne le résumé, la réponse exacte, le terminal, rafraîchir, mettre au repos, plus tard et bloquée ; en haut à droite de l'accueil : recherche, cockpit complet, sons, quitter. Clavier : Tab, flèches entre onglets, Échap replie, focus visible, `prefers-reduced-motion` coupe la morphose. Fenêtre : elle épouse exactement l'île (verre acrylique de Windows) et s'anime avec elle.
- Dans une conversation, `/sessions` rouvre le panneau du mod dans l'app.

## Bon à savoir

- Le cockpit a besoin d'au moins une conversation Claude ouverte : c'est elle qui fait tourner le serveur. Sans elle, l'île affiche « Cockpit éteint » et réessaie seule.
- Une conversation n'apparaît avec son statut en direct qu'après avoir chargé le mod (nouvelle conversation, ou redémarrage de l'app).
- Les résumés passent par Haiku et consomment un peu de quota.
- Les polices viennent de Google Fonts. Hors connexion, la page se rabat sur Georgia et Consolas.
- Après une mise à jour, si la page affiche « Le cockpit a été mis à jour », redémarre Claude Desktop : le serveur encore en mémoire ne connaît pas les nouveaux fichiers.
- Le mod écrit ses fichiers de travail (page générée, données, images collées) à la racine du dépôt cloné ; ils sont ignorés par git.

## Mise à jour

```powershell
cd $HOME\source\repos\claude-cockpit
git pull
```

Puis redémarre Claude Desktop, et relance l'île si `desktop/` a changé.

## Désinstallation

Retire la ligne `CLAUDE_CODE_PLUGIN_DIRS` du bloc `env` de `~/.claude/settings.json`, supprime les deux raccourcis et le dossier cloné.

## Écarts au modèle Liquid Paper

Écarts assumés de l'île au modèle du dépôt liquid-paper, qui n'est pas modifié :

- **Mouvement de la forme** : ressort de 300 ms à l'ouverture et 260 ms au repli (règle Mouvement du modèle : ressort de 260 à 300 ms pour le verre), contenu en 150 ms (apparition retardée de 110 ms, sortie 100 ms). Pas d'`opacity` sur le bloc de verre, seulement sur les couches de contenu. Le ressort vit dans `island-ui.js` (`springEase`, testé), le seul jeton local est `--motion-ui`.
- **Verre acrylique du système, la fenêtre EST la forme** : le flou du bureau est celui de Windows (accent acrylique, repli `backgroundMaterial: acrylic`), pas du CSS. L'acrylique ignore `setShape` (vérifié) : la fenêtre épouse donc exactement la pastille ou l'île ouverte (plus les toasts dessous) et c'est elle qui s'anime (`desktop/island/morph.js`, ressort 300 ms / 260 ms, une image toutes les 8 ms demandée, environ 65 tailles distinctes par seconde mesurées, aucun écart de plus de 25 ms au repli). La page ne pose que la teinte de la conversation (`--conv-tint` à 8 %, 6 % en Papier), les reflets de la recette du `.t-sheet` et aucun `backdrop-filter`. **Thème automatique** : l'app lit une douzaine de pixels de l'écran de part et d'autre de l'île (GetPixel, environ 50 ms, jamais pendant une morphose ; une capture d'écran bloquait 350 ms) ; bureau sombre = Nuit avec teinte acrylique de 16 %, bureau clair = Papier (jetons du modèle, encre sombre, teinte claire de 25 %), avec hystérésis (clair au-dessus de 0,55 de luminance, sombre en dessous de 0,40), remesuré toutes les 8 s. Lisibilité mesurée : encre à 11:1 au moins sur bureau sombre, 9,7:1 sur bureau clair (AA visé, texte secondaire à 92 % d'encre). Sans flou du système, plaque `--plate` à 94 %.
- **Classes `is-*` et `div` à la place de `header`/`section`** : la page du cockpit définit des règles globales sur `header`, `section`, `.card`, `.thread`, etc. ; l'île préfixe ses classes pour ne pas les subir. La fenêtre de l'île fait au plus 800 px : les règles étroites du modèle (`@media (max-width: 900px)`, `.ep-side-group` en ligne) sont rétablies en colonne dans `island.css`.
- **Pas de filet de compte à rebours** : la maquette en prévoyait un (2 px, 10 dernières secondes avant le repli) ; l'échéance est dans l'automate de l'app, la page ne la connaît pas.
- **Entités vivantes** : `mod/assets/entity/` (10 systèmes génératifs, 7 états reliés au statut réel, voir `island-model.js`). Réduite, la grande entité est dessinée en 32 px à 15 images/s, ouverte en 96 px à 30 ; les petites ne s'animent que le temps d'une réaction (changement d'état, survol, clic) puis gardent leur dernière image ; la boucle s'arrête quand plus rien ne bouge et pendant que l'île est cachée.
- **Plein écran et état « occupé »** : le sondage du bord est suspendu quand `SHQueryUserNotificationState` renvoie plein écran, Direct3D plein écran, présentation, mais aussi « occupé » (`QUNS_BUSY`), que Windows peut renvoyer hors plein écran (une application qui se déclare occupée). Dans ce cas la révélation par le bord ne marche pas ; les événements et l'entrée « Afficher l'île » restent possibles.
- **Page de secours hors ligne** : une URL `data:` n'a pas accès aux jetons ; ses valeurs recopient le thème Nuit (commentaire dans `desktop/main.js`).
- **Réactions animées des identités** (`mod/assets/identity-motion.js`, modulation pure testée) : attente (relance de 0,6 rad toutes les 6 s, 3 s pour une permission, 280 ms), terminé (tour de la vue en 600 ms : un quart de tour, un demi-tour pour loft qui est presque de révolution), bloqué, erreur et plus tard (vitesse 0, 0 puis 0,04, encre assombrie ou allégée), survol, pression, apparition de l'île (faces tracées en 450 ms, 40 ms de décalage par tête). Écarts assumés :
  - **Pastille d'état** : saut de 4 px en 280 ms (une seule fois, à l'arrivée en « terminé ») et deux déplacements latéraux de 2 px en 150 ms (erreur). Le modèle admet le ressort de 260 à 300 ms pour les pastilles de verre ; ici c'est une pastille sur papier, donc le ressort est amorti, sans rebond ni retour supplémentaire, et reste un déplacement léger.
  - **Durées de 280 et 600 ms** pour les coups de phase des volumes : un volume génératif n'est pas un changement d'état d'interface, ses réactions sont des gestes de dessin, pas des transitions de couleur de 150 ms. Les changements d'encre sont posés à l'image suivante, sans transition.
  - **Rotation** : le modèle écarte la rotation d'interface, mais les volumes tournent déjà par nature (signature des identités). Les réactions ne font qu'ajouter des coups de phase et une pose de face.
  - **Survol, pas de parallaxe** : la tête survolée se tourne vers une pose de face fixe en 280 ms, la même quel que soit l'endroit du curseur. Rien ne suit le curseur ensuite. Désactivé en mouvement réduit.
  - **Pression** : c'est la pastille ronde de la tête (le bouton) qui se tasse à 97 % en 150 ms, conformément à la règle des boutons ; la pastille d'état, à l'intérieur, suit.
  - **Cadence** : 15 images/s au repos ; l'instance qui réagit monte à 30 images/s le temps de sa réaction, puis revient. Aucune boucle quand l'île est cachée (`pause()`).
  - **Mouvement réduit** : chaque réaction donne directement son état final statique (encre seulement), sans animation, sans saut de pastille, sans orientation vers le curseur ; la boucle s'arrête.
- **Sons des identités** (`mod/assets/identity-sound.js`, synthèse WebAudio, aucun fichier son) : le référentiel n'a pas de section Sons, donc ces choix sont locaux. Chaque identité a une note tirée de son seed dans une gamme pentatonique (deux sons superposés restent consonants). Appel (une question attend), permission (une marche plus haut), terminé (accord montant bref), erreur (note grave, triangle) sont actifs ; envoyé et apparition existent mais sont coupés par défaut. Volume 0,12, plafond 0,2, un son par type et par seconde au plus (dans une rafale de plusieurs conversations qui changent d'état ensemble, un seul son de chaque type joue : l'allocation n'est consommée qu'une fois le contexte audio réellement en marche), enveloppes de 60 à 250 ms par voix. Pas de son au survol ni à la pression. Les sons jouent île cachée (c'est leur raison d'être) ; `prefers-reduced-motion` ne les coupe pas (ce n'est pas du mouvement) ; le réglage global les coupe tous : entrée « Couper les sons » / « Activer les sons » du menu de la barre d'état ou bouton Sons de l'accueil de l'île (glyphe `volume`, `aria-pressed`), les deux synchronisés par une IPC de confiance qui n'accepte qu'un booléen (réglage gardé dans `sound.json` du dossier userData, écriture atomique, avec l'annonce unique du premier lancement, un toast mémorisé seulement après 3 s d'affichage). Les sons se taisent aussi quand la session est absente ou verrouillée, quand Windows est occupé, en plein écran Direct3D, en présentation ou en heures calmes (`SHQueryUserNotificationState`, décidé par l'app au moment du son). Toute réponse non booléenne de l'app vaut « coupé ». L'île de l'app lit les sons avec `autoplayPolicy: 'no-user-gesture-required'` ; le contexte audio est créé au premier son et suspendu 500 ms après le dernier. Suite prévue : une page de réglages par type et du volume (aujourd'hui seul le réglage global existe).
- **Toasts dans l'île** : ils se posent sous la forme, à la hauteur que la morphose lui donne (`--dock-room`) ; la fenêtre s'agrandit le temps des toasts (`setToasts`, sans toucher à l'automate) et la forme cliquable les inclut. Ils prennent la surface papier (`data-surface` posé sur leur hôte) et retiennent l'île (`hold` de l'automate : ni repli ni masquage tant qu'un toast est visible). L'annonce du premier lancement des sons est un toast, mémorisée après 3 s. Un toast d'échec persistant garde l'île ouverte jusqu'à Fermer.
- **Limites connues** : le fil d'activité ne montre que ce que le cockpit sait (le nom de l'outil en cours, observé à chaque relève de 3 s, sans fichier ni +N −M) ; le terminal d'une conversation à plusieurs dépôts ouvre le dossier d'ouverture (le choix entre dépôts reste dans le cockpit complet) ; les réglages de taille et de forme du dock n'existent plus (l'île a une seule forme).
- **Coins de Windows** : les coins arrondis de Windows 11 (8 px, `roundedCorners`) s'appliquent aux quatre coins de la fenêtre, y compris en haut : la pastille collée au bord laisse deux petits angles de bureau visibles, et le rayon n'est pas celui de la maquette (14 et 28 px). Windows ne permet pas de coins droits en haut sur une fenêtre à verre acrylique.
- **Épinglage plafonné** : une question à laquelle l'île sait répondre garde l'île ouverte 110 s au plus (comme coucou) puis elle se replie ; la pastille garde le signal tant qu'on attend et ne se cache pas. Une demande d'autorisation que l'île tient épingle de la même façon. Ce que l'île ne peut pas traiter (permission sans l'app, conversation qui fait tourner le cockpit, cockpit sans serveur) n'épingle pas.
- **Survol vérifié au curseur réel** : le survol rapporté par la page ne vient que de mousemove et mouseleave, or une fenêtre qui rétrécit sous un curseur immobile ne reçoit plus rien. L'app confronte donc le curseur réel aux bornes de la fenêtre en fin de morphose et à chaque changement d'état.
- **Pas de raccourcis Ctrl comme coucou (à faire plus tard)** : Ctrl+Droite et Ctrl+Gauche (conversation suivante), Ctrl+1 à Ctrl+9, Ctrl+K (nouvelle conversation), Ctrl+P (épingler), Ctrl+virgule (réglages) et les raccourcis globaux (Ctrl+Alt+N, Ctrl+Alt+Espace, Ctrl+Alt+A, Ctrl+Alt+T…) n'existent pas dans l'île ; seuls Tab, les flèches entre onglets et Échap sont gérés. `Alt+Espace` ouvre toujours le lanceur de recherche.
- **Infobulles** : les boutons à icône seule (recherche, cockpit, sons, quitter, autres conversations) portent l'infobulle Encre et Papier (`data-ep-tip`, au survol et au focus) et un nom accessible.
