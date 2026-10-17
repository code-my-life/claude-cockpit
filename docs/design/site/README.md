# Maquette validée du site de présentation

Référence du site GitHub Pages (issues #49 et #50), validée par Clément le 2026-10-17. Le site construit doit la suivre. Le cadrage complet est dans le repo de la factory (`docs/plans/claude-cockpit-48-49-50-site.md`).

- `index.html` : la page d'accueil en anglais, autonome, avec les fichiers Liquid Paper (`ds/encrepapier/`) et systems-generator 0.1.1 (`vendor/`). Pour l'ouvrir : `python3 -m http.server` depuis ce dossier, puis `http://localhost:8000/`. Les boutons d'état de la section Cards y sont figés ; dans le site, ils changent l'état de la carte.
- `reference/home-1440.webp` et `reference/home-390.webp` : captures pleine page (Chrome, `prefers-reduced-motion: reduce`), pour la lecture humaine seulement.
- Les quatre plaques « Screenshot pending » attendent les captures de l'île que Clément ajoutera dans `docs/media/`.

Comment le site reste fidèle à cette maquette :
1. **Test de structure** (`site/test/structure.test.mjs`) : ordre des sections et ancres, titres, cartes `sg-flip` à deux faces, cinq liens de menu, un seul bouton principal par vue, roadmap présente.
2. **Comparaison visuelle** (`site/test/visual.spec.ts`, Playwright) : la CI affiche dans le même navigateur cette maquette et le site construit, à 1440 et 390 px, mouvement réduit. Elle masque les canevas (fond, cartes), les plaques de captures et la roadmap (générée), et compare avec une tolérance.
3. Toute évolution du site qui change la mise en page passe d'abord par une nouvelle maquette validée, versée ici.

Liquid Paper : © Code My Life, tous droits réservés. Ces fichiers sont exclus de la licence MIT du dépôt.
