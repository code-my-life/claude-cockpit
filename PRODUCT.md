# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Les développeurs qui mènent plusieurs conversations Claude Code en parallèle sur Windows (onglet Code de Claude Desktop, ou terminal), et qui veulent savoir à tout moment qui les attend, qui travaille et qui est bloqué, sans ouvrir chaque conversation. Clément (code-my-life) en est le premier utilisateur ; le produit, public depuis octobre 2026, vise ce public plus large.

## Product Purpose

Suivre et piloter toutes ses conversations d'agents de code depuis un seul endroit : statut en direct, résumé en langage simple de la dernière réponse, réponse rapide (OK, GO, Non ou un message), décision sur les demandes d'autorisation, sans changer de fenêtre. Le succès : aucune conversation n'attend sans que l'utilisateur le sache, et une réponse se donne en un geste.

## Positioning

Le cockpit vit dans l'agent lui-même : un mod chargé par chaque conversation publie son statut réel et reçoit les ordres, au lieu de deviner l'état de l'extérieur. L'île, une forme de verre toujours au premier plan au bord haut de l'écran, porte l'urgence sans qu'on ait à regarder ailleurs. Chaque conversation a son identité générative et sa carte holographique, dont la rareté se gagne par le travail accompli et la réactivité.

Aujourd'hui centré sur Claude Code, le produit se destine à devenir le cockpit de tous les agents de code de l'utilisateur (Hermes et OpenCode prévus, épics ouverts).

## Operating Context

- Poste Windows 10 ou 11, Claude Desktop avec l'onglet Code, plusieurs conversations ouvertes en même temps, souvent sur plusieurs dépôts.
- L'utilisateur travaille dans d'autres fenêtres : l'île et les sons signalent ce qui attend ; le cockpit complet sert à faire le point.
- Tout tourne en local : le serveur du cockpit est lancé par l'app (ou par une conversation), aucun service n'est déployé.

## Capabilities and Constraints

- Trois pièces : le mod (`mod/`, plugin Claude Code), le cockpit (page servie en local, vues Liste et Équipe, une carte par conversation), l'île et l'app Electron (`desktop/`, installeur Windows, mise à jour automatique).
- Fonctions : statut en direct (t'attend, en mission, attente de PR ou de CI, bloquée, plus tard, au repos), résumés par Claude Haiku, réponses rapides et messages libres avec images collées, demandes d'autorisation tranchées depuis l'île, conversations mises de côté avec une raison, terminal ouvert dans le dépôt, nouvelle conversation, recherche globale, chiffres par conversation et du jour.
- Windows seulement pour l'installation complète ; macOS et Linux ne plantent plus mais ne sont pas portés.
- Confidentialité : l'app lit les sessions Claude Code locales, n'écrit dans `~/.claude/settings.json` qu'après accord, et n'envoie à l'extérieur que la dernière réponse d'une conversation à Claude Haiku pour le résumé.
- Interface en français (tutoiement) ; code, commentaires et tests en anglais.
- Ouvert : la portée multi-agents (Hermes, OpenCode) n'est pas encore construite.

## Brand Commitments

- Nom : Claude Cockpit.
- Design system imposé : Liquid Paper (Encre et Papier), paquet privé `@code-my-life/liquid-paper`, copié dans `mod/assets/liquid-paper/`. Les écarts assumés de l'île sont documentés dans le README.
- Cartes et fonds génératifs : `@code-my-life/systems-generator` (cartes holographiques `<sg-card>`, `<sg-flip>`, fonds `BgGen`).
- Aucun tiret cadratin dans les textes.

## Evidence on Hand

- Releases publiques sur GitHub (dernière : v0.4.0), installeur Windows et sommes de contrôle.
- Suite de tests du mod (plus de 500 tests), tests e2e Electron (Playwright, job `e2e` sur `windows-latest`).
- Aucun témoignage, chiffre d'usage, client ou article de presse : ne pas en inventer.
- Pas encore de captures de l'app dans le dépôt : Clément les fournit.

## Product Principles

1. Personne n'attend en silence : ce qui demande l'utilisateur doit se voir sans qu'il le cherche, et se traiter en un geste.
2. La vérité vient de l'agent : le statut affiché est celui que la conversation publie, jamais une supposition.
3. Le jeu fait partie du produit : la rareté gagnée, les relances, les records et les combos récompensent la réactivité et le travail ; les choix futurs les préservent.
4. Local et sobre : rien ne quitte la machine sans raison explicite, et l'outil ne vole pas le focus ni l'attention hors de ce qui attend.
5. Un cockpit pour tous les agents : les choix d'architecture et de vocabulaire ne doivent pas enfermer le produit dans Claude Code.

## Accessibility & Inclusion

- Navigation clavier complète dans l'île (Tab, flèches entre onglets, Échap), focus visible, raccourcis globaux qui évitent ceux des autres outils.
- `prefers-reduced-motion` coupe la morphose de l'île et les animations des identités ; les sons se coupent globalement.
- Les états ne passent jamais par la couleur seule : icône et mot.
