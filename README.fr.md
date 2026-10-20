<div align="center">

# Claude Cockpit

**Un seul endroit pour voir quelles conversations Claude Code t'attendent, travaillent ou sont bloquées, et pour répondre sans ouvrir l'app.**

[English](README.md) | Français

[![Site][site-badge]][site]
[![Licence][license-badge]][license]
[![Plateforme][platform-badge]][installing]
[![Conçu pour Claude Code][claude-badge]][claude-code]
[![Feuille de route][roadmap-badge]][roadmap]

[![Dernière version][release-badge]][releases]
[![Date de la version][date-badge]][releases]
[![Téléchargements][downloads-badge]][releases]
[![Téléchargements de la dernière version][latest-badge]][releases]

[![Tests][tests-badge]][tests]
[![E2E][e2e-badge]][e2e]
[![Electron][electron-badge]][electron-pkg]
[![Node][node-badge]][development]

[![Dernier commit][commit-badge]][commits]
[![Tickets ouverts][issues-badge]][issues]

</div>

<!-- Screenshot: cddev adds one capture here, e.g. <p align="center"><img src="docs/screenshot.png" alt="Claude Cockpit" width="800"></p> -->

[site-badge]: https://img.shields.io/badge/site-code--my--life.github.io-000000?style=flat
[site]: https://code-my-life.github.io/claude-cockpit/
[license-badge]: https://img.shields.io/badge/license-MIT-blue?style=flat
[license]: LICENSE
[platform-badge]: https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4?style=flat
[installing]: #installer
[claude-badge]: https://img.shields.io/badge/built%20for-Claude%20Code-D97757?style=flat
[claude-code]: https://docs.claude.com/en/docs/claude-code/overview
[roadmap-badge]: https://img.shields.io/badge/roadmap-milestones-555555?style=flat
[roadmap]: https://code-my-life.github.io/claude-cockpit/#roadmap
[release-badge]: https://img.shields.io/github/v/release/code-my-life/claude-cockpit?style=flat&sort=semver
[date-badge]: https://img.shields.io/github/release-date/code-my-life/claude-cockpit?style=flat
[downloads-badge]: https://img.shields.io/github/downloads/code-my-life/claude-cockpit/total?style=flat
[latest-badge]: https://img.shields.io/github/downloads/code-my-life/claude-cockpit/latest/total?style=flat&label=downloads%40latest
[releases]: https://github.com/code-my-life/claude-cockpit/releases
[tests-badge]: https://img.shields.io/github/actions/workflow/status/code-my-life/claude-cockpit/test.yml?branch=main&label=tests&style=flat
[tests]: https://github.com/code-my-life/claude-cockpit/actions/workflows/test.yml
[e2e-badge]: https://img.shields.io/github/actions/workflow/status/code-my-life/claude-cockpit/e2e.yml?branch=main&label=e2e&style=flat
[e2e]: https://github.com/code-my-life/claude-cockpit/actions/workflows/e2e.yml
[electron-badge]: https://img.shields.io/github/package-json/dependency-version/code-my-life/claude-cockpit/dev/electron?filename=desktop/package.json&style=flat
[electron-pkg]: desktop/package.json
[node-badge]: https://img.shields.io/badge/node-%E2%89%A5%2022.18-339933?style=flat
[development]: #développement
[commit-badge]: https://img.shields.io/github/last-commit/code-my-life/claude-cockpit?style=flat
[commits]: https://github.com/code-my-life/claude-cockpit/commits/main
[issues-badge]: https://img.shields.io/github/issues/code-my-life/claude-cockpit?style=flat
[issues]: https://github.com/code-my-life/claude-cockpit/issues

Claude Cockpit suit toutes les conversations de l'onglet Code de Claude Desktop. Quand tu en mènes plusieurs à la fois, il te dit laquelle t'attend, laquelle travaille et laquelle est bloquée, et te laisse répondre d'un geste, sans changer de fenêtre. Tout tourne sur ta machine : aucun service n'est déployé.

Il se compose de trois pièces :

- **Le mod** (`mod/`) : un mod Claude Code chargé par chaque conversation. Il publie le vrai statut, demande à Haiku un résumé en langage simple de la dernière réponse, et fait tourner un petit serveur local (`http://127.0.0.1:48123/`).
- **Le cockpit** : la page servie par ce serveur, avec deux vues, « Liste » et « Équipe ».
- **L'île** (`desktop/`) : une app Electron qui épingle une forme de verre au bord haut de l'écran, toujours au premier plan, avec une entité vivante pour chaque conversation.

L'interface est en français ; le code est en anglais. Le design suit Liquid Paper (Encre et Papier).

## Premiers pas

1. Télécharge `claude-cockpit-setup-<version>.exe` depuis la [dernière version](https://github.com/code-my-life/claude-cockpit/releases/latest).
2. Lance-le, et accepte la ligne qu'il ajoute à `~/.claude/settings.json` pour charger le mod.
3. Redémarre Claude Desktop : chaque nouvelle conversation charge le mod et apparaît dans le cockpit.

Le détail, l'installation depuis le code et la désinstallation sont dans [Installer](#installer).

## Fonctionnalités

- **Statut en direct** de chaque conversation : t'attend (permission, question, mission livrée), en mission, attend une PR ou la CI, bloquée, plus tard, au repos.
- **Résumé en langage simple** : Haiku réécrit simplement la dernière réponse de Claude, avec la réponse exacte à côté.
- **Réponses rapides** : OK / GO / Non en un clic, ou un message libre (images collées acceptées), depuis le cockpit ou l'île.
- **Demandes de permission** tranchées depuis l'île : Refuser, Autoriser, ou Toujours quand Claude propose une règle.
- **Terminal intégré** ouvert dans le dépôt de la conversation, et **nouvelle conversation** avec les dépôts et le premier message de ton choix.
- **Mettre de côté** une conversation comme « bloquée » ou « plus tard », avec une raison.
- **Recherche globale** (Ctrl+K) dans tes messages et les réponses de Claude, insensible aux accents.
- **Chiffres** par conversation et par jour (messages, temps actif, outils lancés, fichiers modifiés, temps de réponse médian), et une identité générative animée pour chaque conversation.

## Raccourcis

Raccourcis globaux de l'île :

| Raccourci | Action |
|---|---|
| Ctrl+Alt+I | Ouvrir ou replier l'île |
| Ctrl+Alt+R | Aller à ce qui attend (question ou permission) |
| Ctrl+Alt+Page Down / Page Up | Passer à la conversation suivante / précédente |
| Ctrl+Alt+V | Couper ou rétablir les sons |

Un raccourci déjà pris par une autre app est ignoré et noté dans `cockpit.log`.

## Installer

Windows 10 ou 11 uniquement pour l'installation complète. Sur macOS et Linux, le cockpit et l'île ne plantent plus, mais l'installation, les dossiers de dépôts et les résumés ne sont pas encore portés.

### Depuis l'installeur

1. Télécharge `claude-cockpit-setup-<version>.exe` depuis la [dernière version](https://github.com/code-my-life/claude-cockpit/releases/latest) (sommes de contrôle dans `SHA256SUMS.txt`).
2. Lance-le. L'installeur n'est pas encore signé : Windows peut afficher « Windows a protégé votre ordinateur ». Clique sur **Informations complémentaires**, puis **Exécuter quand même**.
3. Au premier lancement, l'assistant montre ce qu'il ajoute à `~/.claude/settings.json`, et ne l'écrit qu'après ton clic : la ligne qui charge le mod, et les hooks du cockpit, qui disent où en est chaque conversation. Si WSL tourne, il fait de même dans le `~/.claude/settings.json` de chaque distribution où Claude Code a servi (les hooks seulement, le mod est propre à Windows). Une copie datée de chaque fichier est gardée à côté.
4. Redémarre Claude Desktop et tes terminaux Claude Code : chaque conversation charge le mod et les hooks à son démarrage.

L'app s'installe pour ton compte Windows uniquement, sans droits administrateur, et se désinstalle depuis les Paramètres de Windows.

### Depuis le code

```powershell
git clone https://github.com/code-my-life/claude-cockpit.git $HOME\source\repos\claude-cockpit
cd $HOME\source\repos\claude-cockpit
.\install.ps1
```

Le script :

1. déclare le mod dans `~/.claude/settings.json` (`CLAUDE_CODE_PLUGIN_DIRS`, bloc `env`) après avoir copié l'ancien fichier vers `settings.json.avant-cockpit` ;
2. installe Electron pour l'île (environ 110 Mo téléchargés) ;
3. pose deux raccourcis sur le bureau : « Conversations Claude » (le cockpit) et « Mini équipe ».

Puis redémarre Claude Desktop.

### Mise à jour

L'app installée vérifie les versions GitHub 30 s après son lancement, puis toutes les 6 heures. Une nouvelle version se télécharge en arrière-plan ; le menu de la barre d'état propose alors « Redémarrer pour passer à la vX.Y.Z », sinon elle s'installe à la prochaine fermeture de l'app. Le mod est mis à jour avec elle : redémarre Claude Desktop pour que les conversations le rechargent. `cockpit.log` note chaque vérification échouée.

Depuis le code : `git pull`, redémarre Claude Desktop, et redémarre l'île si `desktop/` a changé.

### Désinstallation

- **app installée** : désinstalle « Claude Cockpit » depuis les Paramètres de Windows (Applications). Avant de partir, l'app retire le mod et ses hooks des réglages de Claude Code (Windows et distributions WSL en marche), avec une copie datée de chaque fichier, et efface `~/.claude/cockpit`. Une mise à jour n'y touche pas.
- **depuis le code** : retire d'abord le dossier du mod de la ligne `CLAUDE_CODE_PLUGIN_DIRS` du bloc `env` de `~/.claude/settings.json`, puis supprime les deux raccourcis et le dossier cloné.

## Utiliser

- **Conversations Claude** ouvre le cockpit : « + » pour une nouvelle conversation, « Liste / Équipe » pour changer de vue, A− / A+ pour la taille du texte, la cloche pour les notifications système.
- **L'île** est une pièce de verre collée au bord haut de l'écran. Repliée, elle montre l'entité de la conversation la plus urgente, une étiquette d'état et les petites entités des autres. Elle s'ouvre au survol ou au clic en trois onglets : Accueil (conversation au premier plan, dernière question ou fil d'activité, une action principale), Envoyer un ordre (Entrée envoie, images collées acceptées) et Nouvelle conversation.
- **Quand une conversation attend**, l'île s'ouvre seule sur la question, avec une réponse rapide (OK, GO, Non ou un texte). « Plus tard » ou Échap la replie sans répondre ; le badge garde le signal.
- **Permissions** : le mod relaie chaque demande de permission à l'app, et l'île montre la commande ou le fichier concerné avec Refuser, Autoriser et, quand Claude propose une règle, Toujours. Sans réponse en 110 s, la demande retourne à Claude. Pour les conversations de Claude Desktop, l'île tranche avant que Desktop montre sa propre fenêtre, et Desktop reprend la main après 30 s.
- **Fil d'activité** : les dernières étapes du tour (fichier lu ou modifié avec lignes ajoutées et retirées, commande, recherche) ; un clic sur un fichier modifié ouvre son diff sous la carte.
- Dans une conversation, `/sessions` rouvre le panneau du mod dans l'app.
- **Liens de tickets** : le numéro de ticket pris dans la branche ou le titre (`feature/2254-…`, `#2254`) devient un lien si tu renseignes l'option « Lien des tickets » du mod `sessions` (ou `pluginConfigs.sessions.ticketUrl` dans `~/.claude/settings.json`), `https` uniquement, avec `{ticket}` pour le numéro, par exemple `https://tickets.example.com/browse/PROJ-{ticket}`.

Clavier : Tab, flèches entre les onglets, Échap replie, focus visible ; `prefers-reduced-motion` coupe la morphose.

## Développement

Node.js 22.18 ou plus récent est nécessaire pour les tests (les modules purs du mod sont en TypeScript `.mts`).

```bash
npm test               # les modules purs du mod
npm run typecheck:mod  # les types de tout le mod, register.tsx compris
npm run test:mod       # le panneau du mod, dessiné par le moteur de Claude Code sur chaque surface
```

Les tests et la vérification des types tournent sur Windows, macOS et Linux dans GitHub Actions. `npm test` ne charge jamais `register.tsx` : seule la vérification des types le voit.

Le moteur n'écrit les types de son API (`mod/.claude-plugin/types/`, ignoré par git) que sur une machine où il a chargé le mod. La CI lit donc une copie, `ci/mod-types/`, sans les outils MCP propres à une machine. Après une mise à jour de Claude Code, rafraîchis-la depuis `mod/.claude-plugin/types/claude-code/` et `claude-code-tools/`, puis lance `npm run typecheck:mod`.

Le mod garde tout ce qui appelle le moteur dans `mod/hooks/register.tsx` : le moteur ne suit `$` que dans le module qu'il charge, jamais à travers un import. Ce qui n'en a pas besoin vit à côté, avec ses tests : `rows.mts`, `sections.mts`, `summary-text.mts`, `page-data.mts`, `pane.tsx`.

### Publier une version

Monte `version` dans `desktop/package.json`, commite, puis pousse le tag correspondant (`git tag v0.2.0 && git push --tags`). Le workflow `release.yml` lance les tests, construit l'installeur, puis publie la release avec l'installeur, `latest.yml` (lu par les apps installées) et les sommes de contrôle.

## À savoir

- Le cockpit a besoin d'au moins une conversation Claude ouverte : c'est elle qui fait tourner le serveur. Sans elle, l'île affiche « Cockpit éteint » et réessaie seule.
- Une conversation n'affiche son statut en direct qu'après avoir chargé le mod (nouvelle conversation, ou redémarrage de l'app).
- Les résumés passent par Haiku et consomment un peu de quota. C'est la seule chose envoyée à l'extérieur : la dernière réponse d'une conversation.
- Les polices viennent de Google Fonts. Hors ligne, la page se rabat sur Georgia et Consolas.
- Après une mise à jour, si la page dit « Le cockpit a été mis à jour », redémarre Claude Desktop : le serveur encore en mémoire ne connaît pas les nouveaux fichiers.
- Le mod écrit ses fichiers de travail (page générée, données, images collées) à la racine du dépôt cloné ; git les ignore.
- Les écarts de design au modèle Liquid Paper sont consignés [en bas de ce fichier](#écarts-au-modèle-liquid-paper).

## Licence

[MIT](LICENSE).

<a id="écarts-au-modèle-liquid-paper"></a>

<details>
<summary>Écarts au modèle Liquid Paper</summary>
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
- **Raccourcis internes de coucou pas encore repris** : les raccourcis globaux existent (voir plus haut, choisis pour ne pas prendre ceux de coucou), mais pas encore Ctrl+1 à Ctrl+9, Ctrl+K (nouvelle conversation), Ctrl+P (épingler) ni Ctrl+virgule (réglages) dans l'île ouverte ; seuls Tab, les flèches entre onglets et Échap sont gérés. `Alt+Espace` ouvre toujours le lanceur de recherche.
- **Infobulles** : les boutons à icône seule (recherche, cockpit, sons, quitter, autres conversations) portent l'infobulle Encre et Papier (`data-ep-tip`, au survol et au focus) et un nom accessible.
</details>

