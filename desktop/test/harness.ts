// Test harness for the Electron app: every launch gets its own data folder,
// home folder (with a fake Claude Code conversation) and app folders, so a
// run never reads nor writes the real cockpit, and runs beside an installed one.
import { _electron as electron, type ElectronApplication, type Page, type TestInfo, expect } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FakeMod, linkFileOf, readLink } from './fake-mod'
import { buildFixtures, conversationsDataOf, DESKTOP_DATA_SEARCH, desktopDataSessionsDirOf, desktopSessionsBaseOf, writeDesktopSearchSession, writeDesktopSession, type Fixtures, type Row } from './fixtures/structured-data'

export const DESKTOP_DIR = path.join(__dirname, '..')
const FIXTURE_HOME = path.join(__dirname, 'fixtures', 'home')
const SCREENSHOT_TIMEOUT_MS = 5000
const WINDOW_TIMEOUT_MS = 30_000
const WINDOW_POLL_MS = 100
const LINK_TIMEOUT_MS = 30_000

export type Cockpit = {
  app: ElectronApplication, root: string, close: () => Promise<void>,
  fixtures: Fixtures, dataDir: string, link: { port: number, secret: string, dataDir: string },
  // Rewrites conversations-data.js; the pages reload it every 3 s.
  writeData: (rows?: Row[], extra?: Record<string, unknown>) => void,
  startFakeMod: () => Promise<FakeMod>,
  terminalLaunches: () => Array<{ cwd: string, at: number }>,
}

export const isolatedEnv = (root: string, home: string): NodeJS.ProcessEnv => ({
  ...process.env,
  COCKPIT_E2E: '1',
  HOME: home,
  USERPROFILE: home,
  APPDATA: path.join(root, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(root, 'AppData', 'Local'),
  XDG_RUNTIME_DIR: path.join(root, 'run'),
  // Else the machine's real Claude Desktop sessions leak in on Linux.
  XDG_CONFIG_HOME: path.join(home, '.config'),
  COCKPIT_SETTINGS_FILE: path.join(home, '.claude', 'settings.json'),
})

// Where the app reads Claude Desktop sessions (mod/assets/terminal.mjs, hostSessionsDirsOf).
const configBaseOf = (env: NodeJS.ProcessEnv) => (process.platform === 'win32' ? env.APPDATA! : env.XDG_CONFIG_HOME!)

export const launchCockpit = async (testInfo: TestInfo): Promise<Cockpit> => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-e2e-'))
  const home = path.join(root, 'home')
  fs.cpSync(FIXTURE_HOME, home, { recursive: true })
  for (const dir of ['AppData/Roaming', 'AppData/Local', 'run', 'home/.config']) fs.mkdirSync(path.join(root, dir), { recursive: true, mode: 0o700 })
  const env = isolatedEnv(root, home)
  const fixtures = buildFixtures(root, configBaseOf(env))
  // Before launch: the server lists the MSIX package folders when it starts.
  // Its folder sits inside work/: the server also allows the siblings of a known folder (known-folders.mjs).
  const desktopFolder = path.join(fixtures.folders.work, 'e2e-desktop-search')
  fs.mkdirSync(desktopFolder, { recursive: true })
  writeDesktopSearchSession(home, desktopSessionsBaseOf(env), desktopFolder)
  const dataFolder = path.join(fixtures.folders.work, DESKTOP_DATA_SEARCH.engineId)
  fs.mkdirSync(dataFolder, { recursive: true })
  writeDesktopSession(home, desktopDataSessionsDirOf(env), dataFolder, DESKTOP_DATA_SEARCH)
  const removeRoot = () => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  const app = await electron.launch({
    args: [DESKTOP_DIR, `--user-data-dir=${path.join(root, 'user-data')}`],
    cwd: DESKTOP_DIR,
    env: env as Record<string, string>,
  }).catch(error => { removeRoot(); throw error })
  const output: string[] = []
  app.process().stdout?.on('data', chunk => output.push(String(chunk)))
  app.process().stderr?.on('data', chunk => output.push(String(chunk)))
  await app.context().tracing.start({ screenshots: true, snapshots: true, sources: true })

  // The app writes link.json (port, secret, data folder) once its server listens: no probe needed.
  const linkFile = linkFileOf(process.platform, env, home)
  await expect.poll(() => fs.existsSync(linkFile), { timeout: LINK_TIMEOUT_MS }).toBe(true)
  const link = readLink(linkFile)
  const writeData = (rows = fixtures.rows, extra: Record<string, unknown> = {}) =>
    fs.writeFileSync(path.join(link.dataDir, 'conversations-data.js'), conversationsDataOf(rows, extra))
  writeData()
  const mods: FakeMod[] = []
  const startFakeMod = async () => {
    const mod = new FakeMod(link, 'e2e-fake-mod')
    await mod.start()
    mods.push(mod)
    return mod
  }
  const terminalLog = path.join(link.dataDir, 'e2e-terminal.jsonl')
  const terminalLaunches = () => (fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [])

  const close = async () => {
    await Promise.all(mods.map(mod => mod.stop()))
    await app.context().tracing.stop({ path: testInfo.outputPath('trace.zip') }).catch(() => {})
    await app.close().catch(() => {})
    await testInfo.attach('electron-output', { body: output.join(''), contentType: 'text/plain' })
    const log = path.join(root, 'user-data', 'cockpit.log')
    if (fs.existsSync(log)) await testInfo.attach('cockpit.log', { body: fs.readFileSync(log), contentType: 'text/plain' })
    removeRoot()
  }
  return { app, root, close, fixtures, link, dataDir: link.dataDir, writeData, startFakeMod, terminalLaunches }
}

// The first window whose address matches, waiting for it when it is not open yet. A window
// is announced on about:blank before it loads its address, so the addresses are polled.
export const windowWhere = async (app: ElectronApplication, isWanted: (url: string) => boolean): Promise<Page> => {
  const deadline = Date.now() + WINDOW_TIMEOUT_MS
  for (;;) {
    const found = app.windows().find(page => isWanted(page.url()))
    if (found !== undefined) return found
    if (Date.now() > deadline) throw new Error(`no matching window, seen by the test: [${app.windows().map(page => page.url()).join(', ')}], by the app: [${await mainProcessUrls(app)}]`)
    await new Promise(resolve => setTimeout(resolve, WINDOW_POLL_MS))
  }
}

const mainProcessUrls = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.webContents.getURL()).join(', ')).catch(error => String(error))

export const islandWindow = async (app: ElectronApplication): Promise<Page> => {
  const page = await windowWhere(app, url => url.includes('island=1'))
  await page.waitForLoadState('domcontentloaded')
  return page
}

// The island opened on a click, as a user does.
export const openIsland = async (app: ElectronApplication): Promise<Page> => {
  const island = await islandWindow(app)
  await island.locator('#compactBtn').click()
  await expect(island.locator('html')).toHaveAttribute('data-island', 'open')
  return island
}

// The cockpit window does not exist at launch: the island's cockpit button opens it.
export const openCockpit = async (app: ElectronApplication): Promise<Page> => {
  const island = await openIsland(app)
  await island.locator('[data-act="cockpit"]').first().click()
  const page = await windowWhere(app, url => !url.includes('island=1') && !url.includes('launcher=1') && url.startsWith('http'))
  await page.waitForLoadState('domcontentloaded')
  return page
}

type Bounds = { x: number, y: number, width: number, height: number }
type Probe = { serverPort: () => number | null, islandPhase: () => string | null, isIslandFocused: () => boolean, areSoundsOn: () => boolean, hasGlobalShortcuts: () => boolean, hasUpdater: () => boolean, showLauncher: () => void, isLauncherVisible: () => boolean, launcherBounds: () => Bounds | null, cursorWorkArea: () => Bounds }

// Reads one value of the main process through the probe main.js exposes in test mode.
export const probe = <K extends keyof Probe>(app: ElectronApplication, key: K): Promise<ReturnType<Probe[K]>> =>
  app.evaluate((_electron, name) => (globalThis as unknown as { cockpitE2E: Probe }).cockpitE2E[name as keyof Probe]() as never, key)

export const attachScreenshot = async (testInfo: TestInfo, page: Page, name: string) => {
  const file = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path: file, timeout: SCREENSHOT_TIMEOUT_MS }).catch(() => {})
  if (fs.existsSync(file)) await testInfo.attach(name, { path: file, contentType: 'image/png' })
}
