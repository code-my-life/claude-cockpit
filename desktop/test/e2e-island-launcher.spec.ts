// The island and the launcher, driven in the real Electron app (#42, PR 2b): permission requests,
// reply from the top card, order view, lower cards (C1 to C4); launcher suggestions, placement,
// height, search, keyboard, Claude Desktop conversations (D1 to D6). Fake data and fake mod as in PR 2a.
import { expect, test, type Page } from '@playwright/test'
import { attachScreenshot, launchCockpit, openIsland, probe, windowWhere, type Cockpit } from './harness'
import { askPermission, permissionDecision } from './fake-mod'
import { DESKTOP_DATA_SEARCH, DESKTOP_SEARCH } from './fixtures/structured-data'

const DATA_REFRESH_MS = 10_000
// The server indexes the transcripts on the first search: up to 20 s by design (conversations.html).
const FIRST_SEARCH_MS = 25_000
const PERMISSION_ARM_MS = 600

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

const only = (...engineIds: string[]) => cockpit.fixtures.rows.filter(row => engineIds.includes(row.engineId))

const deck = (island: Page) => island.locator('#pile sg-flip[data-engine]')

// The launcher has no global shortcut in test mode: the probe shows it, as Alt+Space would.
const showLauncher = async (): Promise<Page> => {
  const launcher = await windowWhere(cockpit.app, url => url.includes('launcher=1'))
  await probe(cockpit.app, 'showLauncher')
  await expect.poll(() => probe(cockpit.app, 'isLauncherVisible')).toBe(true)
  // Shown before its data, the launcher redraws its suggestions once they arrive: wait for that load.
  await expect.poll(() => launcher.evaluate(() => (window as unknown as { __CONVERSATIONS__?: { rows: unknown[] } }).__CONVERSATIONS__?.rows.length ?? 0), { timeout: 2 * DATA_REFRESH_MS }).toBeGreaterThan(0)
  await expect(launcher.locator('#search-results .search-row').first()).toBeVisible({ timeout: DATA_REFRESH_MS })
  await expect(launcher.locator('#search-results .search-status')).toBeVisible({ timeout: DATA_REFRESH_MS })
  return launcher
}

// Links leave the app through shell.openExternal: record them instead of opening Claude Desktop.
const recordOpenedLinks = () => cockpit.app.evaluate(({ shell }) => {
  const opened: string[] = []
  ;(globalThis as unknown as { e2eOpened: string[] }).e2eOpened = opened
  shell.openExternal = async (url: string) => { opened.push(url) }
})
const openedLinks = () => cockpit.app.evaluate(() => (globalThis as unknown as { e2eOpened: string[] }).e2eOpened)

test('C1: a permission request shows in the island; a click before it is armed is ignored; "Autoriser" then decides it', async ({}, testInfo) => {
  cockpit.writeData(only('e2e-perm'))
  const island = await openIsland(cockpit.app)
  const requestId = await askPermission(cockpit.link, { engineId: 'e2e-perm', tool: 'Bash', summary: 'npm test' })
  const allow = island.locator('[data-act="perm"][data-decision="allow"]')
  await expect(allow).toBeVisible({ timeout: DATA_REFRESH_MS })
  // At once, as a stray click right when the request appears.
  await allow.evaluate(button => (button as HTMLButtonElement).click())
  expect(await permissionDecision(cockpit.link, requestId)).toBeNull()
  await island.waitForTimeout(PERMISSION_ARM_MS)
  await allow.click()
  await expect.poll(() => permissionDecision(cockpit.link, requestId)).toBe('allow')
  // Decided: the island folds and the request leaves it.
  await expect(island.locator('html')).toHaveAttribute('data-island', 'compact')
  await expect(allow).toBeHidden()
  await attachScreenshot(testInfo, island, 'C1-autorisation')
})

test('C2: answering from the top card of the island: the mod gets the reply, the island folds', async () => {
  const mod = await cockpit.startFakeMod()
  cockpit.writeData(only('e2e-question'))
  const island = await openIsland(cockpit.app)
  await expect(deck(island).first()).toHaveAttribute('data-engine', 'e2e-question', { timeout: DATA_REFRESH_MS })
  await island.locator('#replyInput').fill('Plein écran')
  await island.locator('#replyInput').press('Enter')
  expect((await mod.waitForOrder(order => order.type === 'reply' && order.engineId === 'e2e-question')).text).toBe('Plein écran')
  await expect(island.locator('html')).toHaveAttribute('data-island', 'compact')
})

test('C3: the "Envoyer un ordre" view spans the island width', async ({}, testInfo) => {
  // A conversation that takes orders (a pending permission does not).
  cockpit.writeData(only('e2e-question'))
  const island = await openIsland(cockpit.app)
  await expect(deck(island).first()).toBeVisible({ timeout: DATA_REFRESH_MS })
  await island.locator('[data-tab="order"]').click()
  const form = island.locator('#orderForm')
  await expect(form).toBeVisible()
  const [formWidth, viewWidth] = await Promise.all([form.evaluate(el => el.getBoundingClientRect().width), island.locator('#v-order').evaluate(el => el.getBoundingClientRect().width)])
  expect(formWidth / viewWidth).toBeGreaterThanOrEqual(0.9)
  await attachScreenshot(testInfo, island, 'C3-ordre')
})

test('C4: a click on a lower card brings it forward without turning it over', async () => {
  cockpit.writeData(only('e2e-question', 'e2e-delivered'))
  const island = await openIsland(cockpit.app)
  await expect(deck(island)).toHaveCount(2, { timeout: DATA_REFRESH_MS })
  const top = await deck(island).first().getAttribute('data-engine')
  const lower = top === 'e2e-question' ? 'e2e-delivered' : 'e2e-question'
  // The top card covers the middle of the lower one: click the strip of it that shows below,
  // once the deck has settled (the cards slide in when the island opens).
  const card = island.locator(`#pile sg-flip[data-engine="${lower}"]`)
  const seen: string[] = []
  await expect.poll(async () => {
    seen.push(JSON.stringify(await card.boundingBox()))
    return seen.length >= 3 && seen.slice(-3).every(box => box === seen[seen.length - 1])
  }, { intervals: [150] }).toBe(true)
  const box = JSON.parse(seen[seen.length - 1]) as { x: number, y: number, width: number, height: number }
  const [x, y] = [box.x + box.width / 2, box.y + box.height - 4]
  expect(await island.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('sg-flip')?.getAttribute('data-engine'), [x, y])).toBe(lower)
  await island.mouse.click(x, y)
  await expect(deck(island).first()).toHaveAttribute('data-engine', lower)
  await expect(deck(island).first()).toHaveAttribute('flipped', '')
  await expect(island.locator('html')).toHaveAttribute('data-island', 'open')
})

test('C5: on a permission request, no "Détails" button is drawn over the request (#52)', async ({}, testInfo) => {
  cockpit.writeData(only('e2e-perm'))
  const island = await openIsland(cockpit.app)
  await askPermission(cockpit.link, { engineId: 'e2e-perm', tool: 'Bash', summary: 'npm test' })
  await expect(island.locator('[data-act="perm"][data-decision="allow"]')).toBeVisible({ timeout: DATA_REFRESH_MS })
  const alert = island.locator('.alert-main:visible').first()
  await expect(alert).toBeVisible()
  const request = (await alert.boundingBox())!
  for (const details of await island.locator('[data-act="details"]:visible').all()) {
    const box = (await details.boundingBox())!
    const overlaps = box.x < request.x + request.width && request.x < box.x + box.width && box.y < request.y + request.height && request.y < box.y + box.height
    expect(overlaps, `"Détails" at ${JSON.stringify(box)} over the request at ${JSON.stringify(request)}`).toBe(false)
  }
  await attachScreenshot(testInfo, island, 'C5-autorisation')
})

test('D1: with an empty query, at most 8 suggestions, the waiting ones first, under "N conversations t\'attendent"', async () => {
  const launcher = await showLauncher()
  const waiting = cockpit.fixtures.rows.filter(row => ['permission', 'done', 'external'].includes(row.status)).sort((a, b) => b.updatedAt - a.updatedAt)
  await expect(launcher.locator('#search-results .search-status')).toHaveText(`${waiting.length} conversations t'attendent`)
  const rows = launcher.locator('#search-results .search-row')
  await expect(rows).toHaveCount(8)
  for (const [index, row] of waiting.entries()) await expect(rows.nth(index)).toContainText(row.title)
})

test('D2: the launcher is centred, 720 px wide at most, at 22 % of the height of the screen in use', async () => {
  await showLauncher()
  const area = await probe(cockpit.app, 'cursorWorkArea')
  const bounds = (await probe(cockpit.app, 'launcherBounds'))!
  const width = Math.min(720, area.width - 48)
  expect(bounds.width).toBe(width)
  expect(bounds.x).toBe(area.x + Math.round((area.width - width) / 2))
  expect(bounds.y).toBe(area.y + Math.round(area.height * 0.22))
})

test('D3: the launcher height follows its content', async () => {
  const launcher = await showLauncher()
  const area = await probe(cockpit.app, 'cursorWorkArea')
  // The content height, capped by the room left below the launcher on the screen.
  const expected = async () => Math.min(await launcher.locator('#wrap').evaluate(el => el.scrollHeight), area.y + area.height - (await probe(cockpit.app, 'launcherBounds'))!.y)
  const height = async () => (await probe(cockpit.app, 'launcherBounds'))!.height
  await expect.poll(async () => Math.abs((await height()) - (await expected()))).toBeLessThanOrEqual(2)
  const tall = await height()
  expect(tall).toBeGreaterThan(64)
  await launcher.locator('#search-input').fill('motintrouvablexyz')
  await expect(launcher.locator('#search-results .search-status')).toHaveText('Aucune conversation ne contient tous ces mots', { timeout: FIRST_SEARCH_MS })
  await expect.poll(height).toBeLessThan(tall)
  await expect.poll(async () => Math.abs((await height()) - (await expected()))).toBeLessThanOrEqual(2)
})

test('D4: a word of a conversation finds it; a missing word says so', async () => {
  const launcher = await showLauncher()
  const search = launcher.locator('#search-input')
  await search.fill('repli')
  await expect(launcher.locator('#search-results .search-row')).toHaveCount(1, { timeout: FIRST_SEARCH_MS })
  await expect(launcher.locator('#search-results .search-row')).toContainText('repli')
  await search.fill('motintrouvablexyz')
  await expect(launcher.locator('#search-results .search-status')).toHaveText('Aucune conversation ne contient tous ces mots')
  await expect(launcher.locator('#search-results .search-row')).toHaveCount(0)
})

test('D5: arrows move without wrapping; Enter opens the link and hides the launcher; Escape and losing focus hide it', async () => {
  await recordOpenedLinks()
  let launcher = await showLauncher()
  const rows = launcher.locator('#search-results .search-row')
  await expect(rows).toHaveCount(8)
  const search = launcher.locator('#search-input')
  await search.press('ArrowUp')
  await expect(rows.nth(0)).toHaveClass(/\bselected\b/)
  for (let i = 0; i < 10; i++) await search.press('ArrowDown')
  await expect(rows.nth(7)).toHaveClass(/\bselected\b/)
  const href = await rows.nth(7).getAttribute('href')
  expect(href).toMatch(/^claude:\/\/claude\.ai\/epitaxy\//)
  await search.press('Enter')
  await expect.poll(openedLinks).toEqual([href])
  await expect.poll(() => probe(cockpit.app, 'isLauncherVisible')).toBe(false)

  launcher = await showLauncher()
  await launcher.locator('#search-input').press('Escape')
  await expect.poll(() => probe(cockpit.app, 'isLauncherVisible')).toBe(false)

  await showLauncher()
  await cockpit.app.evaluate(({ BrowserWindow }) => {
    const other = new BrowserWindow({ width: 480, height: 320, x: 40, y: 200, title: 'Autre fenêtre' })
    other.loadURL('data:text/html,<title>Autre fenêtre</title><h1>Autre fenêtre</h1>')
    other.focus()
  })
  await expect.poll(() => probe(cockpit.app, 'isLauncherVisible')).toBe(false)
})

test('D6: a Claude Desktop conversation (MSIX install on Windows) is found by the launcher with its Desktop title and link', async () => {
  const launcher = await showLauncher()
  await launcher.locator('#search-input').fill(DESKTOP_SEARCH.word)
  const row = launcher.locator('#search-results a.search-row')
  await expect(row).toHaveCount(1, { timeout: FIRST_SEARCH_MS })
  await expect(row).toContainText(DESKTOP_SEARCH.title)
  await expect(row).toHaveAttribute('href', `claude://claude.ai/epitaxy/${DESKTOP_SEARCH.sessionId}`)
})

test('D7: a Claude Desktop conversation kept in Claude-Data (Windows) is found by the launcher with its Desktop title and link', async () => {
  const launcher = await showLauncher()
  await launcher.locator('#search-input').fill(DESKTOP_DATA_SEARCH.word)
  const row = launcher.locator('#search-results a.search-row')
  await expect(row).toHaveCount(1, { timeout: FIRST_SEARCH_MS })
  await expect(row).toContainText(DESKTOP_DATA_SEARCH.title)
  await expect(row).toHaveAttribute('href', `claude://claude.ai/epitaxy/${DESKTOP_DATA_SEARCH.sessionId}`)
})
