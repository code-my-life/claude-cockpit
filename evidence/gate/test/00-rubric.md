# Rubrique — Gate Claude (test hors Kanban)

## Brief

- **Worktree** : `/home/cleme/perso/claude-cockpit/.worktrees/t_2fe761e4`
- **Branche** : `wt/t_2fe761e4`
- **Base commit** : `11364c264bb531b3cdbb9694860790ebb009e514`
- **Tip commit** : `176e98c`
- **PR** : https://github.com/code-my-life/claude-cockpit/pull/27 — *Fix #8: island event-open + blur fold*
- **Modèle** : `claude-sonnet-5-5`
- **Mode** : `factory-gate` section 0 (Mode Claude) — lecture seule, pas d'écriture hors `evidence/`

## Diff stat (`git diff 11364c2..HEAD --stat`)

```
desktop/island/controller.js |  1 +
desktop/island/fsm.js        |  4 ++++
desktop/island/fsm.test.js   | 12 ++++++++++++
desktop/main.js              |  1 +
mod/assets/island-ui.js      |  3 +--
5 files changed, 19 insertions(+), 2 deletions(-)
```

## Commits (5)

```
176e98c fix: supprime openWith('wait','event') de onFreshWait pour ne plus ouvrir l'île à chaque événement
55d6a4c fix: écoute blur sur la fenêtre île pour replier l'île ouverte par l'utilisateur
b9a7f49 fix: expose blur() dans le controller pour déléguer au fsm
b91afbd fix: expose blur() dans createIslandFsm pour replier l'île ouverte au blur
553e995 test: ajoute blur() — OPEN → COMPACT ; COMPACT ou HIDDEN → inchangé
```

## 14 Critères du skill factory-gate

1. **Test fail-first** — Exécuter le test pertinent sur `base_commit` (worktree temporaire) : rouge attendu. Sur `tip_commit` : vert attendu. Sinon régression de méthode.
2. **Typecheck et build hors ligne** — After bootstrap (réseau), `docker run --rm --network none -v "$PWD":/workspace -w /workspace nousresearch/hermes-sandbox:desktop sh -c "npm run typecheck:mod && cd desktop && npm run build"`. Si Docker indisponible : `unshare -rn` ou noter « réseau non coupé » dans `not_verified`.
3. **Suite complète** — Lancer `npm run test`, échecs connus listés avant (AGENTS.md). Compter les fichiers qui échouent sans assertion à part.
4. **Tests navigateur** — Tout fichier de test navigateur touché est rejoué en entier, pas seulement le nouveau cas.
5. **Changement d'UI** — `agent-browser` ouvre l'app/page à 390 et 1280 px, clair et sombre ; parcours des flux modifiés avec enregistrement vidéo ; console et réseau tailés ; captures comparées. Texte coupé, chevauchement, flash, état vide = échec.
6. **Contrat PR** — `gh pr checks 27 --watch --fail-fast` doit être vert. Rouge = rework avec URL du check.
7. **Ressources (app longue durée)** — Lancer, mesurer `ps` et `/proc` à 0, 60 et 180s : descripteurs, RSS, redémarrages, temps d'arrêt.
8. **Vérifications ciblées** — Auth sur toute route nouvelle, validation des entrées et chemins, sandboxing de tout rendu, nouvelles dépendances (`npm ls`, licence, taille), concurrence, préservation des données. Tenter de casser : entrées limites, double appel, réseau coupé puis rétabli.
9. **Protocole flake** — Échec inattendu : rejouer 3x sur `base_commit` et 3x sur `tip_commit`. Rouge des deux côtés = flake (non bloquant, créer carte triage). Rouge seulement sur tip = régression bloquante.
10. **Preuves obligatoires avant verdict** — `evidence/gate/test/` doit contenir : `01-fail-first-on-base.txt`, `02-fail-first-on-tip.txt`, `03-full-suite.txt`, `04-typecheck.txt`, `05-build-offline.txt`, et `ui/` avec captures (si changement UI). `metadata.checks` liste chaque vérification avec son chemin de preuve.
11. **Publier sur la PR** — `gh pr review 27 --comment --body-file evidence/gate/test/review.md`. Si approuvé : `gh pr ready 27` et `gh pr edit 27 --add-reviewer cddev`. Si rework : PR reste en brouillon.
12. **Verdict unique** — Approve : `kanban_complete` ; Rework : `kanban_comment` + `kanban_request_changes` ; Escalade : `kanban_block`.
13. **Handoff evidence files check** — Chaque fichier listé dans `evidence` du handoff doit exister et dire ce que le handoff prétend. Fichier manquant ou contradictoire = `kanban_request_changes` immédiat.
14. **Graphify impact** — `get_pr_impact` ou `get_neighbors` sur fichiers changés ; tout appelant non couvert par test devient vérification ciblée.

## Contrainde de sortie

**Rends UNIQUEMENT un JSON** avec cette structure exacte :

```json
{
  "verdict": "APPROVE" | "CHANGES",
  "checks": [
    {"critere": "<numéro>. <nom>", "preuve": "<path evidence>", "ok": true | false}
  ],
  "findings": ["<finding1>", "<finding2>"],
  "not_verified": ["<criteres_non_verifies_avec_raison>"]
}
```

Pas de texte autour, pas de markdown, juste le JSON. Utilise les outils `Read`, `Grep`, `Glob`, `Bash(npm *)`, `Bash(pnpm *)`, `Bash(node *)`, `Bash(git diff*)`, `Bash(git log*)`, `Bash(git show*)`, `Bash(gh pr view*)`, `Bash(gh pr checks*)` pour tes vérifications.
