// Fake conversations for the e2e tests, in the exact format the pages read from
// <dataDir>/conversations-data.js: window.__CONVERSATIONS__ = { generatedAt, rows, folders }.
// Built per launch: the working folders are real folders inside the test root, and the terminal ones
// are declared as Claude Desktop sessions, so the server knows them (mod/assets/known-folders.mjs).
import fs from 'node:fs'
import path from 'node:path'

const MINUTE = 60_000
// The last message of every thread: a card back must never show it in place of the title.
export const LAST_MESSAGE = 'Dernier message du fil, jamais sur le dos de la carte'

export type Row = {
  engineId: string, hostId: string | null, title: string, cwd: string, status: string, tool?: string,
  updatedAt: number, isLive: boolean, summary?: Record<string, unknown>, park?: Record<string, unknown>,
}

export type Fixtures = { rows: Row[], folders: { work: string, unknown: string } }

const summaryOf = (updatedAt: number, kind: string | undefined, awaiting: string, repos: string[] = []) => ({
  updatedAt, text: `Résumé : ${awaiting || 'travail en cours'}`, plain: `Résumé : ${awaiting || 'travail en cours'}`,
  awaiting, kind, isLoading: false, repos,
  thread: [{ role: 'user', text: 'Lance la tâche' }, { role: 'assistant', text: LAST_MESSAGE }],
})

const parkOf = (kind: string, reason: string, at: number) => ({ kind, reason, at, updatedAt: at, hasMoved: false })

// Creates the folders and the Desktop sessions under `root`, returns the rows.
export const buildFixtures = (root: string, configBase: string, now = Date.now()): Fixtures => {
  const work = path.join(root, 'work')
  const unknown = path.join(root, 'elsewhere', 'unknown-folder')
  const dir = (...parts: string[]) => { const folder = path.join(work, ...parts); fs.mkdirSync(folder, { recursive: true }); return folder }
  fs.mkdirSync(unknown, { recursive: true })
  const at = (minutesAgo: number) => now - minutesAgo * MINUTE
  const row = (engineId: string, title: string, status: string, minutesAgo: number, extra: Partial<Row> = {}, kind?: string, awaiting = '', repos: string[] = []): Row => {
    const updatedAt = at(minutesAgo)
    return { engineId, hostId: `host-${engineId}`, title, cwd: dir(engineId), status, updatedAt, isLive: true, summary: summaryOf(updatedAt, kind, awaiting, repos), ...extra }
  }
  const termOne = dir('e2e-term-one')
  const termTwo = dir('e2e-term-two')
  const rows: Row[] = [
    row('e2e-perm', 'Migration de la base clients', 'permission', 2, {}, undefined, 'Autoriser npm test ?'),
    row('e2e-question', 'Choix de la mise en page', 'done', 3, {}, 'question', 'Plein écran ou île seule ?'),
    row('e2e-delivered', 'Jetons du thème', 'done', 4, {}, 'delivered', ''),
    row('e2e-working', 'Graphe des dépôts', 'tool', 1, { tool: 'Bash' }),
    row('e2e-blocked', 'Test instable', 'blocked', 50, { park: parkOf('blocked', 'Attente client', at(50)) }),
    row('e2e-later', 'Documentation', 'later', 60, { park: parkOf('later', 'Pas prioritaire', at(60)) }),
    row('e2e-seen', 'Revue des PR', 'seen', 90),
    row('e2e-term-one', 'Terminal sur un dépôt', 'permission', 5, {}, undefined, 'Ouvrir le terminal ?', [dir('e2e-term-one', 'src')]),
    row('e2e-term-two', 'Terminal sur deux dépôts', 'permission', 6, {}, undefined, 'Ouvrir le terminal ?', [dir('e2e-term-two', 'lib'), dir('e2e-term-two', 'src')]),
    row('e2e-term-unknown', 'Terminal hors des dossiers connus', 'permission', 7, { cwd: unknown }, undefined, 'Ouvrir le terminal ?'),
  ]
  // Desktop sessions: their folders are the ones the server lets a terminal open.
  const sessions = path.join(configBase, 'Claude', 'claude-code-sessions', 'e2e-account', 'e2e-org')
  fs.mkdirSync(sessions, { recursive: true })
  for (const [engineId, cwd] of [['e2e-term-one', termOne], ['e2e-term-two', termTwo]]) {
    fs.writeFileSync(path.join(sessions, `${engineId}.json`), JSON.stringify({ sessionId: `host-${engineId}`, cliSessionId: engineId, title: engineId, cwd, lastActivityAt: now, isArchived: false }))
  }
  return { rows, folders: { work, unknown } }
}

export const conversationsDataOf = (rows: Row[], extra: Record<string, unknown> = {}): string =>
  `window.__CONVERSATIONS__ = ${JSON.stringify({ generatedAt: Date.now(), rows, folders: [], ...extra })};`

// D6 (#1): a Claude Desktop conversation found by the launcher search, with its Desktop title and link.
// Its session file sits in the MSIX package folder on Windows (the Microsoft Store install), in the
// classic config folder elsewhere; its transcript holds a word only it contains.
export const DESKTOP_SEARCH = { engineId: 'e2e-desktop-search', sessionId: 'host-e2e-desktop-search', title: 'Conversation Desktop retrouvée', word: 'marqueurdesktop' }

export const desktopSessionsBaseOf = (env: NodeJS.ProcessEnv, platform = process.platform): string =>
  platform === 'win32' ? path.join(env.LOCALAPPDATA!, 'Packages', 'Claude_e2etest', 'LocalCache', 'Roaming') : env.XDG_CONFIG_HOME!

export const writeDesktopSearchSession = (home: string, sessionsBase: string, cwd: string, now = Date.now()) => {
  const sessions = path.join(sessionsBase, 'Claude', 'claude-code-sessions', 'e2e-account', 'e2e-org')
  fs.mkdirSync(sessions, { recursive: true })
  fs.writeFileSync(path.join(sessions, `${DESKTOP_SEARCH.engineId}.json`), JSON.stringify({
    sessionId: DESKTOP_SEARCH.sessionId, cliSessionId: DESKTOP_SEARCH.engineId, title: DESKTOP_SEARCH.title, cwd, lastActivityAt: now, isArchived: false,
  }))
  const project = path.join(home, '.claude', 'projects', 'e2e-desktop')
  fs.mkdirSync(project, { recursive: true })
  const at = new Date(now).toISOString()
  fs.writeFileSync(path.join(project, `${DESKTOP_SEARCH.engineId}.jsonl`), [
    { type: 'user', message: { role: 'user', content: `Retrouve le ${DESKTOP_SEARCH.word} dans le cockpit` }, timestamp: at, cwd },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Trouvé.' }] }, timestamp: at, cwd },
  ].map(line => JSON.stringify(line)).join('\n') + '\n')
}
