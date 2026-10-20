// The cards of the cockpit page and of the island, driven in the real Electron app (#42, PR 2a):
// sections, card backs and deck (A1 to A4), card actions and the orders they send (B1 to B9).
// The data are fake conversations (fixtures/structured-data.ts); the orders reach a fake mod.
import path from 'node:path'
import fs from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { attachScreenshot, launchCockpit, openCockpit, openIsland, type Cockpit } from './harness'
import { LAST_MESSAGE } from './fixtures/structured-data'

const DATA_REFRESH_MS = 10_000
// A 1×1 transparent PNG, pasted as an image into a reply field.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let cockpit: Cockpit

test.beforeEach(async ({}, testInfo) => {
  cockpit = await launchCockpit(testInfo)
})

test.afterEach(async ({}, testInfo) => {
  for (const page of cockpit.app.windows()) {
    if (page.url().includes('launcher=1')) continue
    await attachScreenshot(testInfo, page, page.url().includes('island=1') ? 'ile-fin' : 'cockpit-fin')
  }
  await cockpit.close()
})

const cardOf = (page: Page, engineId: string) => page.locator(`sg-flip[data-engine="${engineId}"]`)

// A card shows its back first: turn it over, as a user does, to reach the buttons of the front.
const turnOver = async (page: Page, engineId: string) => {
  const card = cardOf(page, engineId)
  await expect(card).toBeVisible({ timeout: DATA_REFRESH_MS })
  // Centred, so that neither this click nor the ones on its buttons scroll the card under the
  // Windows drag strip, which swallows clicks at the top of the window.
  await card.evaluate(el => el.scrollIntoView({ block: 'center' }))
  await card.locator('sg-card').click()
  await expect(card).toHaveAttribute('flipped', '')
  return card
}

const settledBox = async (locator: ReturnType<Page['locator']>) => {
  const seen: string[] = []
  await expect.poll(async () => {
    seen.push(JSON.stringify(await locator.boundingBox()))
    return seen.length >= 3 && seen.slice(-3).every(box => box === seen[seen.length - 1])
  }, { intervals: [150] }).toBe(true)
  return JSON.parse(seen[seen.length - 1]) as { x: number, y: number, width: number, height: number }
}

const toast = (page: Page, title: string) => page.locator('.ep-toast').filter({ has: page.locator('.ep-toast__title', { hasText: title }) })

const pasteImage = (page: Page, engineId: string) =>
  cardOf(page, engineId).locator('textarea[data-role="draft"]').evaluate((field, base64) => {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], 'capture.png', { type: 'image/png' }))
    field.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, PNG_BASE64)

test('A1: each fake conversation sits in its section of the cockpit page', async ({}, testInfo) => {
  const page = await openCockpit(cockpit.app)
  await expect(page.locator('#s-waiting [data-engine]').first()).toBeAttached({ timeout: DATA_REFRESH_MS })
  // The conversations at rest are listed once their toggle is opened, as a user does.
  await page.locator('#rest-toggle').click()
  const expected: Record<string, string[]> = {
    's-waiting': ['e2e-perm', 'e2e-question', 'e2e-delivered'],
    's-working': ['e2e-working'],
    's-parked': ['e2e-blocked', 'e2e-later'],
    's-others': ['e2e-seen'],
  }
  for (const [section, engineIds] of Object.entries(expected)) {
    for (const engineId of engineIds) {
      await expect(page.locator(`#${section} [data-engine="${engineId}"]`).first(), `${engineId} in #${section}`).toBeAttached({ timeout: DATA_REFRESH_MS })
    }
  }
  await expect(page.locator('#s-waiting [data-engine="e2e-working"]')).toHaveCount(0)
  await attachScreenshot(testInfo, page, 'A1-sections')
})

test('A2: a card back shows the session title, not the last message, on two lines at most', async () => {
  const page = await openCockpit(cockpit.app)
  const back = cardOf(page, 'e2e-perm').locator('sg-card')
  await expect(back).toHaveAttribute('heading', /.+/, { timeout: DATA_REFRESH_MS })
  const heading = (await back.getAttribute('heading'))!
  expect(heading.split('|').length).toBeLessThanOrEqual(2)
  expect(heading.replace(/\|/g, ' ')).toBe('Migration de la base clients')
  expect(heading).not.toContain(LAST_MESSAGE)
})

test('A3: the open island shows the deck, top card face up, never an empty block', async ({}, testInfo) => {
  const island = await openIsland(cockpit.app)
  const pile = island.locator('#pile sg-flip[data-engine]')
  await expect(pile.first()).toBeVisible({ timeout: DATA_REFRESH_MS })
  await expect(pile.first()).toHaveAttribute('flipped', '')
  await expect(island.locator('#homeText')).not.toBeEmpty()
  await attachScreenshot(testInfo, island, 'A3-paquet')
})

test('A5: the team view (ÉQUIPE) shows cards, not the old rows, and a card keeps its face across a data refresh (#66)', async ({}, testInfo) => {
  const page = await openCockpit(cockpit.app)
  await expect(cardOf(page, 'e2e-question')).toBeVisible({ timeout: DATA_REFRESH_MS })
  await page.locator('[data-view="team"]').click()
  const team = page.locator('#team')
  const teamCard = (engineId: string) => team.locator(`sg-flip[data-engine="${engineId}"]`)
  for (const [zone, engineId] of [['waiting', 'e2e-question'], ['working', 'e2e-working'], ['stuck', 'e2e-blocked'], ['later', 'e2e-later']]) {
    await expect(team.locator(`.t-zone.${zone} sg-flip[data-engine="${engineId}"]`)).toBeVisible()
  }
  await expect(team.locator('.t-agent')).toHaveCount(0)
  const card = teamCard('e2e-question')
  await card.evaluate(el => el.scrollIntoView({ block: 'center' }))
  await card.locator('sg-card').click()
  await expect(card).toHaveAttribute('flipped', '')
  // New data: the page renders again; the card is the same node, still face up.
  const marker = await card.evaluate(el => { (el as HTMLElement & { e2eMarker?: number }).e2eMarker = 1; return 1 })
  const before = await page.evaluate(() => (window as unknown as { __CONVERSATIONS__: { generatedAt: number } }).__CONVERSATIONS__.generatedAt)
  cockpit.writeData()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __CONVERSATIONS__: { generatedAt: number } }).__CONVERSATIONS__.generatedAt), { timeout: DATA_REFRESH_MS * 2 }).toBeGreaterThan(before)
  expect(await teamCard('e2e-question').evaluate(el => (el as HTMLElement & { e2eMarker?: number }).e2eMarker)).toBe(marker)
  await expect(teamCard('e2e-question')).toHaveAttribute('flipped', '')
  await attachScreenshot(testInfo, page, 'A5-equipe')
})

test('A4: with another page version, the island shows the update notice', async ({}, testInfo) => {
  const island = await openIsland(cockpit.app)
  await expect(island.locator('#pile sg-flip[data-engine]').first()).toBeVisible({ timeout: DATA_REFRESH_MS })
  // The mod stamps both the page it writes and the data: here the page says one version, the data another.
  await island.addInitScript(() => { (window as unknown as { __PAGE_VERSION__: string }).__PAGE_VERSION__ = 'e2e-installed' })
  cockpit.writeData(undefined, { pageVersion: 'e2e-served' })
  await island.reload()
  await expect(island.locator('#homeText')).toContainText('Le cockpit a été mis à jour', { timeout: DATA_REFRESH_MS })
  await attachScreenshot(testInfo, island, 'A4-avis')
})

test('B1: "Agrandir" enlarges the card; Escape and the backdrop close it; the label reads "Réduire"', async () => {
  const page = await openCockpit(cockpit.app)
  const card = await turnOver(page, 'e2e-perm')
  const enlarge = card.locator('[data-testid="card-enlarge"]')
  await enlarge.click()
  await expect(card).toHaveClass(/\bbig\b/)
  await expect(enlarge).toContainText('Réduire')
  await page.keyboard.press('Escape')
  await expect(card).not.toHaveClass(/\bbig\b/)
  await enlarge.click()
  await expect(card).toHaveClass(/\bbig\b/)
  // A click outside the card lands on the backdrop. Bottom left: on Windows a drag strip covers the top
  // of the glass window (.drag-strip, -webkit-app-region: drag) and swallows clicks.
  const corner = await page.evaluate(() => ({ x: 8, y: innerHeight - 8 }))
  await expect.poll(() => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, corner)).toBe('backdrop')
  await page.mouse.click(corner.x, corner.y)
  await expect(card).not.toHaveClass(/\bbig\b/)
})

test('B2: "Voir la réponse exacte" opens the thread, aria-expanded follows', async () => {
  const page = await openCockpit(cockpit.app)
  const card = await turnOver(page, 'e2e-perm')
  const exact = card.locator('[data-testid="card-exact-answer"]')
  const thread = card.locator('[data-engine-thread="e2e-perm"]')
  await expect(exact).toHaveAttribute('aria-expanded', 'false')
  await exact.click()
  await expect(exact).toHaveAttribute('aria-expanded', 'true')
  await expect(thread).toContainText(LAST_MESSAGE)
  await exact.click()
  await expect(exact).toHaveAttribute('aria-expanded', 'false')
  await expect(thread).toHaveCount(0)
})

test('B3: "Replier" leaves the big format and the thread without turning the card over', async () => {
  const page = await openCockpit(cockpit.app)
  const card = await turnOver(page, 'e2e-perm')
  await card.locator('[data-testid="card-enlarge"]').click()
  await expect(card).toHaveClass(/\bbig\b/)
  await expect(card.locator('[data-engine-thread="e2e-perm"]')).toBeVisible()
  await card.locator('[data-testid="card-collapse"]').click()
  await expect(card).not.toHaveClass(/\bbig\b/)
  await expect(card.locator('[data-engine-thread="e2e-perm"]')).toHaveCount(0)
  await expect(card).toHaveAttribute('flipped', '')
})

test('B4: a click on a front button never turns the card over; the flip picto does', async () => {
  const page = await openCockpit(cockpit.app)
  const card = await turnOver(page, 'e2e-perm')
  await card.locator('[data-testid="card-exact-answer"]').click()
  await expect(card).toHaveAttribute('flipped', '')
  await card.locator('[data-testid="card-enlarge"]').click()
  await expect(card).toHaveAttribute('flipped', '')
  await page.keyboard.press('Escape')
  await expect(card).not.toHaveClass(/\bbig\b/)
  // The picto lets the pointer through (pointer-events: none): a click there lands on the front, outside its body.
  const picto = card.locator('.sg-flip__picto')
  await picto.scrollIntoViewIfNeeded()
  // Wait until the page has stopped scrolling and the card has settled (three equal positions in a row),
  // then click where the picto is drawn.
  const box = await settledBox(picto)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(card).not.toHaveAttribute('flipped', '')
})

test('B5: terminal: one repository opens it; two show a menu; an unknown folder fails with a toast', async () => {
  const page = await openCockpit(cockpit.app)
  const work = cockpit.fixtures.folders.work
  const launched = () => cockpit.terminalLaunches().map(launch => launch.cwd)

  await (await turnOver(page, 'e2e-term-one')).locator('[data-testid="card-terminal"]').click()
  await expect.poll(launched, { timeout: DATA_REFRESH_MS }).toContain(path.join(work, 'e2e-term-one', 'src'))
  await expect(toast(page, 'Terminal').first()).toBeVisible()

  await (await turnOver(page, 'e2e-term-two')).locator('[data-testid="card-terminal"]').click()
  const items = page.locator('.repo-menu .repo-item')
  await expect(items).toHaveCount(3)
  // By its shown name: a Windows path is full of backslashes, escape characters in a CSS selector.
  await items.filter({ has: page.locator('.repo-name', { hasText: /^lib$/ }) }).click()
  await expect.poll(launched).toContain(path.join(work, 'e2e-term-two', 'lib'))

  const before = launched().length
  await (await turnOver(page, 'e2e-term-unknown')).locator('[data-testid="card-terminal"]').click()
  await expect(toast(page, 'Terminal non ouvert')).toBeVisible()
  expect(launched()).toHaveLength(before)
})

test('B6: quick reply and reply field: the mod gets "reply" with the right engineId and text; the card goes on mission; the draft empties', async () => {
  const mod = await cockpit.startFakeMod()
  const page = await openCockpit(cockpit.app)
  const card = await turnOver(page, 'e2e-perm')
  const draft = card.locator('textarea[data-role="draft"]')
  await draft.fill('Vas-y, lance les tests')
  await card.locator('[data-action="send"]').click()
  const order = await mod.waitForOrder(o => o.type === 'reply' && o.engineId === 'e2e-perm')
  expect(order.text).toBe('Vas-y, lance les tests')
  await expect(page.locator('#s-working [data-engine="e2e-perm"]').first()).toBeAttached()
  await expect(cardOf(page, 'e2e-perm').locator('textarea[data-role="draft"]')).toHaveValue('')

  await (await turnOver(page, 'e2e-question')).locator('[data-action="quick"][data-text="OK"]').click()
  expect((await mod.waitForOrder(o => o.type === 'reply' && o.engineId === 'e2e-question')).text).toBe('OK')
})

test('B7: with no mod connected, sending shows "Non envoyé" and keeps the draft', async () => {
  const page = await openCockpit(cockpit.app)
  const card = await turnOver(page, 'e2e-perm')
  await card.locator('textarea[data-role="draft"]').fill('Réponse qui ne partira pas')
  await card.locator('[data-action="send"]').click()
  await expect(toast(page, 'Non envoyé')).toBeVisible()
  await expect(card.locator('.feedback.error')).toContainText('Non envoyé')
  await expect(card.locator('textarea[data-role="draft"]')).toHaveValue('Réponse qui ne partira pas')
})

test('B8: block with a reason, resume, put to rest: the mod gets park, unpark and ack with the right fields; toasts show', async () => {
  const mod = await cockpit.startFakeMod()
  const page = await openCockpit(cockpit.app)

  await (await turnOver(page, 'e2e-question')).locator('[data-action="park"][data-kind="blocked"]').click()
  await page.locator('.park-menu .park-input').fill('Attente du client')
  await page.locator('.park-menu .park-ok').click()
  const park = await mod.waitForOrder(o => o.type === 'park' && o.engineId === 'e2e-question')
  expect([park.kind, park.reason]).toEqual(['blocked', 'Attente du client'])
  await expect(toast(page, 'Bloquée')).toBeVisible()

  await (await turnOver(page, 'e2e-blocked')).locator('[data-action="unpark"]').click()
  await mod.waitForOrder(o => o.type === 'unpark' && o.engineId === 'e2e-blocked')
  await expect(toast(page, 'Reprise')).toBeVisible()

  await (await turnOver(page, 'e2e-delivered')).locator('[data-action="seen"]').click()
  expect((await mod.waitForOrder(o => o.type === 'ack' && o.engineId === 'e2e-delivered')).seen).toBe(true)
  await expect(toast(page, 'Au repos')).toBeVisible()
})

test('B9: a pasted image shows a thumbnail that can be removed; once sent, the order carries the saved image', async () => {
  const mod = await cockpit.startFakeMod()
  const page = await openCockpit(cockpit.app)
  const card = await turnOver(page, 'e2e-perm')
  await pasteImage(page, 'e2e-perm')
  await expect(card.locator('.thumb img')).toHaveCount(1)
  await card.locator('.thumb [data-action="remove-image"]').click()
  await expect(card.locator('.thumb img')).toHaveCount(0)
  await pasteImage(page, 'e2e-perm')
  await expect(card.locator('.thumb img')).toHaveCount(1)
  await card.locator('textarea[data-role="draft"]').fill('Avec la capture')
  await card.locator('[data-action="send"]').click()
  const order = await mod.waitForOrder(o => o.type === 'reply' && o.engineId === 'e2e-perm')
  expect(order.images).toHaveLength(1)
  expect(order.images![0]).toMatch(/\.png$/)
  expect(fs.existsSync(order.images![0])).toBe(true)
})
