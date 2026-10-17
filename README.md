<div align="center">

# Claude Cockpit

**One place to see which Claude Code conversations are waiting for you, working, or stuck, and to answer without opening the app.**

English | [Français](README.fr.md)

[![Site][site-badge]][site]
[![License][license-badge]][license]
[![Platform][platform-badge]][installing]
[![Built for Claude Code][claude-badge]][claude-code]
[![Roadmap][roadmap-badge]][roadmap]

[![Latest release][release-badge]][releases]
[![Release date][date-badge]][releases]
[![Downloads][downloads-badge]][releases]
[![Downloads of the latest release][latest-badge]][releases]

[![Tests][tests-badge]][tests]
[![E2E][e2e-badge]][e2e]
[![Electron][electron-badge]][electron-pkg]
[![Node][node-badge]][development]

[![Last commit][commit-badge]][commits]
[![Open issues][issues-badge]][issues]

</div>

<!-- Screenshot: cddev adds one capture here, e.g. <p align="center"><img src="docs/screenshot.png" alt="Claude Cockpit" width="800"></p> -->

[site-badge]: https://img.shields.io/badge/site-code--my--life.github.io-000000?style=flat
[site]: https://code-my-life.github.io/claude-cockpit/
[license-badge]: https://img.shields.io/badge/license-MIT-blue?style=flat
[license]: LICENSE
[platform-badge]: https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4?style=flat
[installing]: #installing
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
[development]: #development
[commit-badge]: https://img.shields.io/github/last-commit/code-my-life/claude-cockpit?style=flat
[commits]: https://github.com/code-my-life/claude-cockpit/commits/main
[issues-badge]: https://img.shields.io/github/issues/code-my-life/claude-cockpit?style=flat
[issues]: https://github.com/code-my-life/claude-cockpit/issues

Claude Cockpit follows every conversation of the Code tab in Claude Desktop. When you run several at once, it tells you which one is waiting for you, which one is working and which one is blocked, and lets you answer in one gesture, without switching windows. Everything runs on your machine: no service is deployed.

It comes in three pieces:

- **The mod** (`mod/`): a Claude Code mod loaded by each conversation. It publishes the real status, asks Haiku for a plain-language summary of the last answer, and runs a small local server (`http://127.0.0.1:48123/`).
- **The cockpit**: the page served by that server, with two views, "Liste" and "Équipe".
- **The island** (`desktop/`): an Electron app that pins a glass shape to the top edge of the screen, always on top, with a living entity for each conversation.

The interface is in French; the code is in English. The design follows Liquid Paper (Encre et Papier).

## Get started

1. Download `claude-cockpit-setup-<version>.exe` from the [latest release](https://github.com/code-my-life/claude-cockpit/releases/latest).
2. Run it, and accept the line it adds to `~/.claude/settings.json` to load the mod.
3. Restart Claude Desktop: each new conversation loads the mod and shows up in the cockpit.

Details, from-source install and uninstall are in [Installing](#installing).

## Features

- **Live status** for every conversation: waiting for you (permission, question, delivered mission), on a mission, waiting for a PR or CI, blocked, later, at rest.
- **Plain-language summary**: Haiku rewrites Claude's last answer simply, with the exact answer next to it.
- **Quick replies**: OK / GO / No in one click, or a free message (pasted images accepted), from the cockpit or the island.
- **Permission requests** decided from the island: Deny, Allow, or Always when Claude proposes a rule.
- **Built-in terminal** opened in the conversation's repository, and **new conversation** with the repositories and first message of your choice.
- **Set aside** a conversation as "blocked" or "later", with a reason.
- **Global search** (Ctrl+K) across your messages and Claude's answers, accent-insensitive.
- **Numbers** per conversation and per day (messages, active time, tools run, files changed, median response time), and a generative animated identity for each conversation.

## Shortcuts

Global shortcuts of the island:

| Shortcut | Action |
|---|---|
| Ctrl+Alt+I | Open or fold the island |
| Ctrl+Alt+R | Go to what is waiting (question or permission) |
| Ctrl+Alt+Page Down / Page Up | Move from one conversation to the next / previous |
| Ctrl+Alt+V | Mute or unmute the sounds |

A shortcut already taken by another app is skipped and noted in `cockpit.log`.

## Installing

Windows 10 or 11 only for the full install. On macOS and Linux the cockpit and the island no longer crash, but installation, repository folders and summaries are not ported yet.

### From the installer

1. Download `claude-cockpit-setup-<version>.exe` from the [latest release](https://github.com/code-my-life/claude-cockpit/releases/latest) (checksums in `SHA256SUMS.txt`).
2. Run it. The installer is not signed yet: Windows may show "Windows protected your PC". Click **More info**, then **Run anyway**.
3. On first launch, the wizard shows the exact line it adds to `~/.claude/settings.json` to load the mod, and writes it only after your click.
4. Restart Claude Desktop: each conversation loads the mod when it starts.

The app installs for your Windows account only, without administrator rights, and uninstalls from Windows Settings.

### From source

```powershell
git clone https://github.com/code-my-life/claude-cockpit.git $HOME\source\repos\claude-cockpit
cd $HOME\source\repos\claude-cockpit
.\install.ps1
```

The script:

1. declares the mod in `~/.claude/settings.json` (`CLAUDE_CODE_PLUGIN_DIRS`, `env` block) after copying the old file to `settings.json.avant-cockpit`;
2. installs Electron for the island (about 110 MB downloaded);
3. puts two shortcuts on the desktop: "Conversations Claude" (the cockpit) and "Mini équipe".

Then restart Claude Desktop.

### Updating

The installed app checks GitHub releases 30 s after launch, then every 6 hours. A new version downloads in the background; the tray menu then offers "Redémarrer pour passer à la vX.Y.Z", otherwise it installs when the app next closes. The mod is updated with it: restart Claude Desktop so conversations reload it. `cockpit.log` records each failed check.

From source: `git pull`, restart Claude Desktop, and restart the island if `desktop/` changed.

### Uninstalling

In both cases, first remove the mod folder from the `CLAUDE_CODE_PLUGIN_DIRS` line of the `env` block in `~/.claude/settings.json`. Then:

- **installed app**: uninstall "Claude Cockpit" from Windows Settings (Apps);
- **from source**: delete the two shortcuts and the cloned folder.

## Running

- **Conversations Claude** opens the cockpit: "+" for a new conversation, "Liste / Équipe" to switch views, A− / A+ for text size, the bell for system notifications.
- **The island** is a glass piece stuck to the top edge of the screen. Folded, it shows the most urgent conversation's entity, a state tag and the small entities of the others. It opens on hover or click into three tabs: Accueil (focused conversation, last question or activity trail, one main action), Envoyer un ordre (Enter sends, pasted images accepted) and Nouvelle conversation.
- **When a conversation is waiting**, the island opens by itself on the question, with a quick reply (OK, GO, No or a text). "Plus tard" or Esc folds it without answering; the badge keeps the signal.
- **Permissions**: the mod relays each permission request to the app, and the island shows the command or file concerned with Deny, Allow and, when Claude proposes a rule, Always. Without an answer in 110 s the request goes back to Claude. For Claude Desktop conversations, the island decides before Desktop shows its own window, and Desktop takes over after 30 s.
- **Activity trail**: the last steps of the turn (file read or edited with lines added and removed, command, search); a click on a modified file opens its diff under the card.
- In a conversation, `/sessions` reopens the mod panel in the app.
- **Ticket links**: the ticket number taken from the branch or title (`feature/2254-…`, `#2254`) becomes a link if you set the "Lien des tickets" option of the `sessions` mod (or `pluginConfigs.sessions.ticketUrl` in `~/.claude/settings.json`), `https` only, with `{ticket}` standing for the number, for example `https://tickets.example.com/browse/PROJ-{ticket}`.

Keyboard: Tab, arrows between tabs, Esc folds, visible focus; `prefers-reduced-motion` turns the morph off.

## Development

Node.js 22.18 or later is needed for the tests (the pure modules of the mod are TypeScript `.mts`).

```bash
npm test               # the pure modules of the mod
npm run typecheck:mod  # the types of the whole mod, register.tsx included
npm run test:mod       # the mod panel, drawn by Claude Code's engine on each surface
```

Tests and type checks run on Windows, macOS and Linux in GitHub Actions. `npm test` never loads `register.tsx`: only the type check sees it.

The engine writes the types of its API (`mod/.claude-plugin/types/`, ignored by git) only on a machine where it loaded the mod. CI therefore reads a copy, `ci/mod-types/`, without the machine-specific MCP tools. After a Claude Code update, refresh it from `mod/.claude-plugin/types/claude-code/` and `claude-code-tools/`, then run `npm run typecheck:mod`.

The mod keeps everything that calls the engine in `mod/hooks/register.tsx`: the engine only follows `$` in the module it loads, never through an import. What does not need it lives next to it, with its tests: `rows.mts`, `sections.mts`, `summary-text.mts`, `page-data.mts`, `pane.tsx`.

### Publishing a version

Raise `version` in `desktop/package.json`, commit, then push the matching tag (`git tag v0.2.0 && git push --tags`). The `release.yml` workflow runs the tests, builds the installer, then publishes the release with the installer, `latest.yml` (read by installed apps) and the checksums.

## Notes

- The cockpit needs at least one open Claude conversation: it is what runs the server. Without it, the island shows "Cockpit éteint" and retries by itself.
- A conversation shows its live status only after it has loaded the mod (new conversation, or app restart).
- Summaries go through Haiku and use a little quota. This is the only thing sent outside: the last answer of a conversation.
- Fonts come from Google Fonts. Offline, the page falls back to Georgia and Consolas.
- After an update, if the page says "Le cockpit a été mis à jour", restart Claude Desktop: the server still in memory does not know the new files.
- The mod writes its working files (generated page, data, pasted images) at the root of the cloned repository; git ignores them.
- The design deviations from the Liquid Paper model are logged in [README.fr.md](README.fr.md#écarts-au-modèle-liquid-paper).

## License

[MIT](LICENSE).
