# AGENTS.md — claude-cockpit (code-my-life/claude-cockpit)

Cockpit pour suivre toutes les conversations Claude Code : Desktop (electron) + mod (plugin Claude Code). Le serveur HTTP en local lit les sessions de l'hôte, expose l'interface et transmet les ordres (ack, park, reply, terminal) au mod via un pont.

## Le repo en 5 lignes

- `desktop/` : app Electron (main, preload, island UI, wizard, build Windows). `package.json` a part.
- `mod/` : plugin Claude Code (`.claude-plugin/plugin.json`, hooks, assets, tests). `ci/tsconfig.mod.json` type-check le mod.
- `ci/` : config TypeScript du mod + workflows GitHub (test cross-OS, release Windows).
- `graphify-out/` : graphe de code genere par `graphify` (ignore localement, reconstruit par la CI). Ne pas commit.

## Commandes (racine, npm)

- `npm install` — bootstrap (dependances de la racine : TypeScript pour le mod).
- `npm run test` — tests Node du mod (`node --test "**/*.test.mjs" "**/*.test.js"`). 518 tests, 517 pass, 1 fail connu (voir ci-dessous).
- `npm run typecheck:mod` — `tsc -p ci/tsconfig.mod.json` (type-check strict du mod, noEmit).
- Tests d'un seul fichier : `node --test mod/assets/server.test.mjs`.
- `cd desktop && npm install && npm run dist` — build de l'installeur Windows (release uniquement).
- `npm run test:mod` — `claude plugin test mod` (validation du plugin).
- E2E : Playwright disponible (`playwright` sur le PATH), aucun script e2e dans le repo pour l'instant.
- Aucun serveur local : le cockpit est une app Desktop + un mod, pas un service web a deployer.

## Conventions

- gestionnaire de paquets : npm (verrouille `package-lock.json` racine + `desktop/package-lock.json`).
- style : JS/TS modules ESM, noms en camelCase, messages en anglais? Non : UI/erreurs/commentaires en anglais (tests en anglais), la doc technique en anglais. Les tests decrient en anglais.
- commits : titre court, corps justifie, pas de co-sign. Branches `fix/...` ou `factory/...`, PR vers `main` avec `--fill`.
- chemins sensibles : `.env` (aucun), `mod/.claude-plugin/types/` (generé), `desktop/dist/` (généré), `session-index.json`, `session-cache.json`, `search-cache.json` (données runtime du cockpit, ignores par `.gitignore`).
- fichiers de données runtime (`inbox/`, `stats-job-*.json`, `conversations.html`, `conversations-data.js`) sont generés ou ignorés : ne pas les commit.

## Echecs connus de la suite

- `npm run test` echoue sur `mod/assets/server.test.mjs:164` — "a terminal cannot be opened on a folder the cockpit does not know" (202 au lieu de 403). Cause racine : le test lance le serveur avec `os.tmpdir()` comme dossier, et l'environnement actuel a `TMPDIR/TEMP/TMP` pointé sur le scratch Hermes (`/home/cleme/.hermes/profiles/tool-setup/cache/scratch`), qui est un dossier connu du cockpit (un transcript Claude Code y pointe). La protection fonctionne : un dossier inconnu est bien refusé. Contournement : `TMPDIR=/tmp node --test mod/assets/server.test.mjs` -> 16/16 pass. La CI passe car elle reset `TMPDIR` sur les runners. Ne pas "reparer" le test en desserrant la securite.

## Interdits du repo

- ne pas commit de secrets, tokens, cle API ou `.env`.
- ne pas modifier `conversations.html` / `conversations-data.js` a la main (generés par le build).
- ne pas checker `node_modules/`, `desktop/dist/`, `graphify-out/`, ni les fichiers de données runtime.
- ne pas deployer le serveur : le cockpit tourne localement uniquement.

## Onboarding / factory

- `hermes verify --detect-only <path> --json` puis `hermes verify --save <path>` ecrit `.hermes/environment.json`.
- `graphify extract <path> --code-only --out <path>/graphify-out --no-gitignore` puis `graphify cluster-only <path>/graphify-out --no-label`.
- contrat PR : repo prives -> `local-only`. Public -> branch protection avec job de test requis (`Tests` workflow).
