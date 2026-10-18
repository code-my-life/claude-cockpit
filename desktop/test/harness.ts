// Test harness for the Electron app: every launch gets its own data folder,
// home folder (with a fake Claude Code conversation) and app folders, so a
// run never reads nor writes the real cockpit, and runs beside an installed one.
import { _electron as electron, type ElectronApplication, type Page, type TestInfo } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DESKTOP_DIR = path.join(__dirname, '..')
const FIXTURE_HOME = path.join(__dirname, 'fixtures', 'home')
const SCREENSHOT_TIMEOUT_MS = 5000
const WINDOW_TIMEOUT_MS = 30_000
const WINDOW_POLL_MS = 100

export type Cockpit = { app: ElectronApplication, root: string, close: () => Promise<void> }

const isolatedEnv = (root: string, home: string): NodeJS.ProcessEnv => ({
  ...process.env,
  COCKPIT_E2E: '1',
  HOME: home,
  USERPROFILE: home,
  APPDATA: path.join(root, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(root, 'AppData', 'Local'),
  XDG_RUNTIME_DIR: path.join(root, 'run'),
  COCKPIT_SETTINGS_FILE: path.join(home, '.claude', 'settings.json'),
})

export const launchCockpit = async (testInfo: TestInfo): Promise<Cockpit> => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-e2e-'))
  const home = path.join(root, 'home')
  fs.cpSync(FIXTURE_HOME, home, { recursive: true })
  for (const dir of ['AppData/Roaming', 'AppData/Local', 'run']) fs.mkdirSync(path.join(root, dir), { recursive: true, mode: 0o700 })
  const removeRoot = () => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  const app = await electron.launch({
    args: [DESKTOP_DIR, `--user-data-dir=${path.join(root, 'user-data')}`],
    cwd: DESKTOP_DIR,
    env: isolatedEnv(root, home) as Record<string, string>,
  }).catch(error => { removeRoot(); throw error })
  const output: string[] = []
  app.process().stdout?.on('data', chunk => output.push(String(chunk)))
  app.process().stderr?.on('data', chunk => output.push(String(chunk)))
  await app.context().tracing.start({ screenshots: true, snapshots: true, sources: true })
  const close = async () => {
    await app.context().tracing.stop({ path: testInfo.outputPath('trace.zip') }).catch(() => {})
    await app.close().catch(() => {})
    await testInfo.attach('electron-output', { body: output.join(''), contentType: 'text/plain' })
    const log = path.join(root, 'user-data', 'cockpit.log')
    if (fs.existsSync(log)) await testInfo.attach('cockpit.log', { body: fs.readFileSync(log), contentType: 'text/plain' })
    removeRoot()
  }
  return { app, root, close }
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

export const cockpitWindow = async (app: ElectronApplication): Promise<Page> => {
  const page = await windowWhere(app, url => url.includes('cockpit') || (!url.includes('island=1') && !url.includes('launcher=1') && url.startsWith('http')))
  await page.waitForLoadState('domcontentloaded')
  return page
}

type Probe = { serverPort: () => number | null, islandPhase: () => string | null, isIslandFocused: () => boolean, areSoundsOn: () => boolean, hasGlobalShortcuts: () => boolean, hasUpdater: () => boolean }

// Reads one value of the main process through the probe main.js exposes in test mode.
export const probe = <K extends keyof Probe>(app: ElectronApplication, key: K): Promise<ReturnType<Probe[K]>> =>
  app.evaluate((_electron, name) => (globalThis as unknown as { cockpitE2E: Probe }).cockpitE2E[name as keyof Probe]() as never, key)

export const attachScreenshot = async (testInfo: TestInfo, page: Page, name: string) => {
  const file = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path: file, timeout: SCREENSHOT_TIMEOUT_MS }).catch(() => {})
  if (fs.existsSync(file)) await testInfo.attach(name, { path: file, contentType: 'image/png' })
}
