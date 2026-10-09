# Claude Cockpit

Un cockpit pour suivre toutes tes conversations Claude Code (onglet Code de Claude Desktop) : qui t'attend, qui travaille, qui est bloqué. Tu réponds sans ouvrir l'app.

Trois morceaux :

- **Le mod** (`mod/`) : un mod Claude Code chargé par chaque conversation. Il publie son statut, demande à Haiku une reformulation simple de la dernière réponse, compte les messages, et fait tourner un petit serveur local (`http://127.0.0.1:48123/`).
- **Le cockpit** : la page servie par ce serveur. Deux vues, « Liste » et « Équipe ».
- **La mini-équipe** (`desktop/`) : une petite application Electron qui pose les têtes de tes conversations dans un coin de l'écran, toujours au-dessus des autres fenêtres.

## Ce que ça fait

- **Identité générative animée** pour chaque conversation : un volume tiré de son identifiant (chrome, ruban torsadé, sections de coque, bande de Möbius) dessiné à l'encre noire du Systems Kit (lavis et hachures), sur un fond de verre teinté d'une couleur unique parmi 24, toujours le même pour une conversation, qui bouge plus vite quand elle t'attend et presque plus quand elle est au repos.
- **Style Liquid Paper, thème Nuit** : verre sur un fond génératif dans le navigateur, vrai flou de Windows 11 dans les fenêtres de bureau (mini équipe et cockpit), Instrument Serif pour les titres, DM Mono pour les étiquettes. Les fichiers du design system sont copiés dans `mod/assets/liquid-paper/`.
- **Statut en direct** de chaque conversation : t'attend (permission, question, mission livrée), en mission, en attente d'une PR ou d'une CI, bloquée, plus tard, au repos.
- **Résumé en clair** : Haiku reformule la dernière réponse de Claude en langage simple, avec la réponse exacte à côté.
- **Répondre depuis le cockpit** : OK / GO / Non en un clic, ou un message libre (images collées acceptées).
- **Mettre de côté** une conversation : 🚫 bloquée ou ⏸️ plus tard, avec une raison.
- **Terminal** ouvert directement dans le dépôt de la conversation.
- **Nouvelle conversation** : choix du ou des dépôts et premier message. Claude s'ouvre avec le message prérempli, il reste à appuyer sur Entrée.
- **Chiffres** par conversation (messages, temps de travail actif, outils lancés, fichiers modifiés) et du jour (messages envoyés, temps de réponse médian).
- Un peu de jeu : relances du jour, record, combos.

## Prérequis

- Windows, Claude Desktop avec l'onglet Code
- Node.js 20 ou plus (`node -v`)
- Chrome ou Edge

## Installation

```powershell
git clone https://github.com/code-my-life/claude-cockpit.git $HOME\source\repos\claude-cockpit
cd $HOME\source\repos\claude-cockpit
.\install.ps1
```

Le script :

1. déclare le mod dans `~/.claude/settings.json` (variable `CLAUDE_CODE_PLUGIN_DIRS`, bloc `env`) après avoir copié l'ancien fichier en `settings.json.avant-cockpit` ;
2. installe Electron pour la mini-équipe (environ 110 Mo téléchargés) ;
3. pose deux raccourcis sur le bureau : « Conversations Claude » (le cockpit) et « Mini équipe ».

Redémarre ensuite Claude Desktop : chaque conversation charge le mod à son démarrage.

## Utilisation

- **Conversations Claude** ouvre le cockpit. ➕ en haut pour une nouvelle conversation, « Liste / Équipe » pour changer de vue, A− / A+ pour la taille du texte, 🔔 pour les notifications Windows.
- **Recherche globale** : le champ en haut du cockpit (Ctrl+K, ou la loupe du dock) cherche dans tes messages et les réponses de Claude de toutes les sessions, sans tenir compte des accents ; un clic ouvre la conversation dans l'app. L'index vit en mémoire dans le serveur du cockpit, repris de `search-cache.json` au démarrage.
- **Mini équipe** pose la bande des têtes en bas à droite. Survol : ce que la conversation attend. Clic : le résumé et la réponse. Le compteur ouvre le cockpit, ＋ ouvre une nouvelle conversation, ✕ ferme la bande. La bande se déplace à la souris et retient sa place.
- Dans une conversation, `/sessions` rouvre le panneau du mod dans l'app.

## Bon à savoir

- Le cockpit a besoin d'au moins une conversation Claude ouverte : c'est elle qui fait tourner le serveur. Sans elle, la mini-équipe affiche « Cockpit éteint » et réessaie seule.
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

Puis redémarre Claude Desktop, et relance la mini-équipe si `desktop/` a changé.

## Désinstallation

Retire la ligne `CLAUDE_CODE_PLUGIN_DIRS` du bloc `env` de `~/.claude/settings.json`, supprime les deux raccourcis et le dossier cloné.
