// The island, driven in the real Electron app (#8): it opens on a click and
// folds back as soon as another window takes the focus.
import { expect, test } from '@playwright/test'
import { attachScreenshot, islandWindow, launchCockpit, probe, type Cockpit } from './harness'

const PRODUCTION_PORT = 48123
// Without the blur handler the island would only fold after its 15 s timer.
const FOLD_ON_BLUR_MS = 5000

let cockpit: Cockpit | null = null

test.beforeEach(async ({}, testInfo) => {
  cockpit = await launchCockpit(testInfo)
})

test.afterEach(async ({}, testInfo) => {
  if (cockpit === null) return
  const island = cockpit.app.windows().find(page => page.url().includes('island=1'))
  if (island !== undefined) await attachScreenshot(testInfo, island, 'ile-fin')
  await cockpit.close()
  cockpit = null
})

test('the test run is isolated from the installed app', async () => {
  const { app } = cockpit!
  await islandWindow(app)
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()
  expect(await probe(app, 'serverPort')).not.toBe(PRODUCTION_PORT)
  expect(await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))).toContain(cockpit!.root)
  expect(await probe(app, 'hasGlobalShortcuts')).toBe(false)
  expect(await probe(app, 'areSoundsOn')).toBe(false)
  expect(await probe(app, 'hasUpdater')).toBe(false)
})

test('should fold when another window takes focus', async ({}, testInfo) => {
  const { app } = cockpit!
  const island = await islandWindow(app)
  const html = island.locator('html')
  await expect(html).toHaveAttribute('data-island', 'compact')

  await island.locator('#compactBtn').click()
  // The click's pointer stays over the island for the page: it leaves, so no hover reopens it once folded.
  await island.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent('mouseleave')))
  await expect(html).toHaveAttribute('data-island', 'open')
  await expect.poll(() => probe(app, 'isIslandFocused')).toBe(true)
  await attachScreenshot(testInfo, island, 'ile-ouverte')

  await app.evaluate(({ BrowserWindow }) => {
    const other = new BrowserWindow({ width: 480, height: 320, x: 40, y: 200, title: 'Autre fenêtre' })
    other.loadURL('data:text/html,<title>Autre fenêtre</title><h1>Autre fenêtre</h1>')
    other.focus()
  })

  await expect(html).toHaveAttribute('data-island', 'compact', { timeout: FOLD_ON_BLUR_MS })
  expect(await probe(app, 'islandPhase')).toBe('compact')
  await attachScreenshot(testInfo, island, 'ile-repliee')
})
