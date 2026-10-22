// No page error on the main screens (audit 2026-10-20, P0 and P1 n° 2): the team view of the cockpit
// window, the island opened on a click and the launcher. Both regressions threw in a render or a
// timer without any visible message, so a test fails on any uncaught error or console error.
import { expect, test, type Page } from '@playwright/test'
import { attachScreenshot, islandWindow, launchCockpit, openCockpit, probe, windowWhere, type Cockpit } from './harness'

const DATA_REFRESH_MS = 10_000

let cockpit: Cockpit

test.beforeEach(async ({}, testInfo) => {
  cockpit = await launchCockpit(testInfo)
})

test.afterEach(async ({}, testInfo) => {
  for (const page of cockpit.app.windows()) {
    if (page.url().startsWith('http')) await attachScreenshot(testInfo, page, page.url().includes('island=1') ? 'ile-fin' : page.url().includes('launcher=1') ? 'lanceur-fin' : 'cockpit-fin')
  }
  await cockpit.close()
})

// Collects the uncaught errors and console errors of a page from now on.
const watchErrors = (page: Page) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  return errors
}

test('E1: the cockpit window renders the list and the team views without any error', async ({}, testInfo) => {
  const page = await openCockpit(cockpit.app)
  const errors = watchErrors(page)
  await expect(page.locator('#s-waiting [data-engine]').first()).toBeAttached({ timeout: DATA_REFRESH_MS })
  await page.locator('.view-switch [data-view="team"]').click()
  await expect(page.locator('#team [data-engine]').first()).toBeAttached({ timeout: DATA_REFRESH_MS })
  await attachScreenshot(testInfo, page, 'E1-equipe')
  await page.locator('.view-switch [data-view="list"]').click()
  await expect(page.locator('#s-waiting [data-engine]').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('E2: the island opened on a click puts the focus inside it, without any error', async () => {
  const island = await islandWindow(cockpit.app)
  const errors = watchErrors(island)
  await expect(island.locator('#pile sg-flip[data-engine]').first()).toBeAttached({ timeout: DATA_REFRESH_MS })
  await island.locator('#compactBtn').click()
  await expect(island.locator('html')).toHaveAttribute('data-island', 'open')
  await expect.poll(() => island.evaluate(() => {
    const active = document.activeElement
    return active !== null && active !== document.body && document.getElementById('island')?.contains(active) === true
  })).toBe(true)
  expect(errors).toEqual([])
})

// Shown first, as Alt+Space does: a launcher never shown yet may not have run its data refresh.
test('E3: the launcher shows its suggestions without any error', async () => {
  const launcher = await windowWhere(cockpit.app, url => url.includes('launcher=1'))
  const errors = watchErrors(launcher)
  await probe(cockpit.app, 'showLauncher')
  await expect.poll(() => probe(cockpit.app, 'isLauncherVisible')).toBe(true)
  await expect(launcher.locator('#search-results .search-row').first()).toBeVisible({ timeout: 2 * DATA_REFRESH_MS })
  expect(errors).toEqual([])
})
