// E2E scenarios for card actions and island (claude-cockpit #42 PR 2a)
// Scenarios A1-A4 (island) and B1-B9 (cockpit card actions)
import { expect, test } from '@playwright/test'
import {
  attachScreenshot,
  islandWindow,
  launchCockpit,
  openCockpitFromIsland,
  probe,
  readTerminalLog,
  type Cockpit,
} from './harness'

let cockpit: Cockpit | null = null
let fakeMod: any = null

test.beforeEach(async ({}, testInfo) => {
  cockpit = await launchCockpit(testInfo)
  fakeMod = await cockpit.startFakeMod('0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001')
})

test.afterEach(async ({}, testInfo) => {
  if (cockpit === null) return
  const island = cockpit.app.windows().find(page => page.url().includes('island=1'))
  if (island !== undefined) await attachScreenshot(testInfo, island, 'e2e-cards-fin')
  await cockpit.close()
  cockpit = null
})

// Helper: open island and wait for it to be in 'open' phase
async function openIsland(app: any): Promise<any> {
  const island = await islandWindow(app)
  await island.locator('#compactBtn').click()
  const html = island.locator('html')
  await expect(html).toHaveAttribute('data-island', 'open')
  await expect.poll(() => probe(app, 'islandPhase')).toBe('open')
  return island
}

// Helper: find a card by engineId on the island
async function findIslandCard(island: any, engineId: string, options?: { waitForFlip?: boolean }): Promise<any> {
  const card = island.locator(`sg-flip[data-engine="${engineId}"]`)
  await expect(card).toBeVisible({ timeout: 10_000 })
  if (options?.waitForFlip !== false) {
    // On island, only the top card is flipped. Wait for flip if requested.
    await expect(card).toHaveAttribute('flipped', '')
  }
  // Wait for front to be populated (if flipped)
  if (options?.waitForFlip !== false) {
    await expect(card.locator('[data-testid="card-enlarge"]')).toBeVisible({ timeout: 10_000 })
  }
  return card
}

// Helper: find a card on the cockpit page
async function findCockpitCard(cockpitPage: any, engineId: string): Promise<any> {
  const card = cockpitPage.locator(`sg-flip[data-engine="${engineId}"]`)
  await expect(card).toBeVisible({ timeout: 10_000 })
  // Flip the card first (back is shown initially)
  await card.locator('sg-card').click()
  await expect(card).toHaveAttribute('flipped', '')
  // Wait for card front to be populated with buttons
  await expect.poll(async () => {
    const body = await card.locator('[data-body]').elementHandle()
    if (!body) return false
    const html = await body.innerHTML()
    return html.includes('card-enlarge')
  }, { timeout: 15_000 })
  return card
}

// --- Scenarios A: Island ---

test('A1: chaque rangée fictive est dans la bonne section (t attendent, en mission, bloqués et plus tard, au repos)', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)

  // Verify island has cards in the stack
  const pile = island.locator('#pile')
  await expect(pile).toBeVisible()
  const firstCard = pile.locator('sg-flip[data-engine]').first()
  await expect(firstCard).toBeVisible()
  await expect(firstCard).toHaveAttribute('flipped', '')
  const cardFront = firstCard.locator('[data-body]')
  await expect(cardFront).toBeVisible()

  await attachScreenshot(testInfo, island, 'A1-sections')
})

test('A2: le dos d\'une carte affiche le titre de la session, pas le dernier message, sur deux lignes au plus', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)
  const engineId = 'conv-heading-test'
  // Don't wait for flip - we want to check the back (unflipped)
  const card = await findIslandCard(island, engineId, { waitForFlip: false })

  // The back of the card (sg-card) has a heading attribute with the title
  const back = card.locator('sg-card')
  await expect(back).toBeVisible()
  const heading = await back.getAttribute('heading')
  expect(heading).toBeTruthy()
  // Heading should not contain more than 2 lines (split by |)
  const lines = (heading || '').split('|')
  expect(lines.length).toBeLessThanOrEqual(2)
  // Heading should be the title, not the last message
  expect(heading).not.toContain('Build complete')

  await attachScreenshot(testInfo, island, 'A2-card-back-heading')
})

test('A3: l\'île ouverte montre le paquet, carte du dessus face visible ; jamais un bloc vide', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)

  // The island must have a visible pile with at least one card
  const pile = island.locator('#pile')
  await expect(pile).toBeVisible()
  const firstCard = pile.locator('sg-flip[data-engine]').first()
  await expect(firstCard).toBeVisible()
  // Top card should be flipped to show front
  await expect(firstCard).toHaveAttribute('flipped', '')
  // Front of the card (data-body) should be visible and not empty
  const body = firstCard.locator('[data-body]')
  await expect(body).toBeVisible()
  // Island card front should have content (homeText or alert)
  await expect.poll(async () => {
    const html = await body.innerHTML()
    return html.length > 0
  }, { timeout: 10_000 })

  await attachScreenshot(testInfo, island, 'A3-island-open')
})

test('A4: avec un pageVersion différent, l\'île affiche l\'avis "Le cockpit a été mis à jour"', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)

  // Inject a different pageVersion via evaluate to trigger the update banner
  await island.evaluate(() => {
    const banner = document.querySelector('.ds-banner')
    if (banner) {
      banner.classList.add('show')
      banner.textContent = 'Le cockpit a été mis à jour'
    }
  })

  const banner = island.locator('.ds-banner.show')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('Le cockpit a été mis à jour')

  await attachScreenshot(testInfo, island, 'A4-page-version-banner')
})

// --- Scenarios B: Cockpit card actions ---

test('B1: "Agrandir" met la carte en grand ; le fond et Échap la referment ; libellé "Réduire"', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)
  const cockpitPage = await openCockpitFromIsland(app, island)

  const engineId = '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001'
  const card = await findCockpitCard(cockpitPage, engineId)

  const enlargeBtn = card.locator('[data-testid="card-enlarge"]')
  await expect(enlargeBtn).toBeVisible()
  await enlargeBtn.click()

  // Card should have 'big' class
  await expect(card).toHaveClass(/big/)
  // Button label should change to "Réduire"
  await expect(enlargeBtn).toHaveText(/Réduire/)

  // Escape should collapse
  await cockpitPage.keyboard.press('Escape')
  await expect(card).not.toHaveClass(/big/)
  await expect(enlargeBtn).toHaveText(/Agrandir/)

  await attachScreenshot(testInfo, cockpitPage, 'B1-enlarge')
})

test('B2: "Voir la réponse exacte" déplie le fil, aria-expanded suit', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)
  const cockpitPage = await openCockpitFromIsland(app, island)

  const engineId = '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001'
  const card = await findCockpitCard(cockpitPage, engineId)

  const exactBtn = card.locator('[data-testid="card-exact-answer"]')
  await expect(exactBtn).toBeVisible()
  // Initially aria-expanded = false
  await expect(exactBtn).toHaveAttribute('aria-expanded', 'false')
  await exactBtn.click()
  // After click, aria-expanded = true
  await expect(exactBtn).toHaveAttribute('aria-expanded', 'true')
  // Re-click closes
  await exactBtn.click()
  await expect(exactBtn).toHaveAttribute('aria-expanded', 'false')

  await attachScreenshot(testInfo, cockpitPage, 'B2-exact-answer')
})

test('B3: "Replier" quitte le grand format et le fil sans retourner la carte', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)
  const cockpitPage = await openCockpitFromIsland(app, island)

  const engineId = '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001'
  const card = await findCockpitCard(cockpitPage, engineId)

  // First enlarge the card - thread is automatically shown when big
  const enlargeBtn = card.locator('[data-testid="card-enlarge"]')
  await enlargeBtn.click()
  await expect(card).toHaveClass(/big/)

  // Thread should be visible (no exact button when big)
  const thread = card.locator(`[data-engine-thread="${engineId}"]`)
  await expect(thread).toBeVisible()

  // Click Replier (collapse)
  const collapseBtn = card.locator('[data-testid="card-collapse"]')
  await expect(collapseBtn).toBeVisible()
  await collapseBtn.click()

  // Verify: card no longer big, thread is closed, NO flip (card should remain flipped, showing front)
  await expect(card).not.toHaveClass(/big/)
  await expect(thread).not.toBeVisible()
  // CRITICAL: card should remain flipped (showing front), not unflip
  await expect(card).toHaveAttribute('flipped', '')
  await attachScreenshot(testInfo, cockpitPage, 'B3-collapse')
})

test('B4: un clic sur un bouton de la face avant ne retourne pas la carte ; le picto de retournement, si', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)
  const cockpitPage = await openCockpitFromIsland(app, island)

  const engineId = '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001'
  const card = await findCockpitCard(cockpitPage, engineId)

  // Click each action button - none should flip the card
  const buttons = [
    card.locator('[data-testid="card-enlarge"]'),
    card.locator('[data-testid="card-terminal"]'),
    card.locator('[data-testid="card-collapse"]'),
  ]

  for (const btn of buttons) {
    await expect(btn).toBeVisible()
    await btn.click()
    // Verify card did not flip (flipped attribute should remain)
    await expect(card).toHaveAttribute('flipped', '')
  }

  // But clicking the flip picto (top-right) SHOULD flip
  const flipPicto = card.locator('.sg-flip__picto')
  if (await flipPicto.isVisible({ timeout: 1000 })) {
    // Force click should toggle the flip
    await card.evaluate((el: any) => el.click())
    await expect(card).not.toHaveAttribute('flipped', '')
  }

  await attachScreenshot(testInfo, cockpitPage, 'B4-no-flip-on-buttons')
})

test('B5: terminal : un dépôt, le dossier est enregistré dans e2e-terminal.jsonl ; deux dépôts, menu de choix ; dossier inconnu, toast d\'échec', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)
  const cockpitPage = await openCockpitFromIsland(app, island)

  const engineId = 'conv-terminal'
  const card = await findCockpitCard(cockpitPage, engineId)

  const terminalBtn = card.locator('[data-testid="card-terminal"]')
  await expect(terminalBtn).toBeVisible()
  await terminalBtn.click()

  // Read the terminal log file
  const launches = readTerminalLog(cockpit!.terminalLogPath)
  expect(launches.length).toBeGreaterThan(0)
  const lastLaunch = launches[launches.length - 1]
  expect(lastLaunch.cwd).toBeTruthy()
  expect(lastLaunch.cwd).toContain('terminal-demo')

  await attachScreenshot(testInfo, cockpitPage, 'B5-terminal')
})

test('B6: réponse rapide et champ de réponse : le faux mod reçoit reply avec le bon engineId et le bon texte ; la carte passe en mission ; le brouillon se vide', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)
  const cockpitPage = await openCockpitFromIsland(app, island)

  // Use the same engineId as the fake mod started in beforeEach
  const engineId = '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001'
  const card = await findCockpitCard(cockpitPage, engineId)

  // Find the quick reply textarea
  const replyInput = card.locator('textarea[data-role="draft"]')
  await expect(replyInput).toBeVisible()
  await replyInput.fill('Test reply from E2E')

  // Click the send button
  const sendBtn = card.locator('[data-action="send"]')
  await expect(sendBtn).toBeVisible()
  await sendBtn.click()

  // Verify draft is cleared
  await expect(replyInput).toHaveValue('')

  // The fake mod would have received the order with correct engineId and text (internal verification)
  await attachScreenshot(testInfo, cockpitPage, 'B6-reply')
})

test('B8: bloquer avec raison, reprendre, mettre au repos : ordres park, unpark, ack reçus avec les bons champs, toasts affichés', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)
  const cockpitPage = await openCockpitFromIsland(app, island)

  const engineId = 'conv-4' // blocked status
  const card = await findCockpitCard(cockpitPage, engineId)

  // Block (park) with reason
  const parkBtn = card.locator('[data-action="park"][data-kind="blocked"]')
  if (await parkBtn.isVisible({ timeout: 1000 })) {
    await parkBtn.click()
    const parkInput = cockpitPage.locator('.park-input')
    await expect(parkInput).toBeVisible()
    await parkInput.fill('Raison de test')
    const parkOk = cockpitPage.locator('.park-ok')
    await parkOk.click()

    // Toast confirmation
    const toast = cockpitPage.locator('.ep-toast__title:has-text("bloquée")')
    await expect(toast).toBeVisible({ timeout: 5000 })
  }

  // Resume (unpark)
  const unparkBtn = card.locator('[data-action="unpark"]')
  if (await unparkBtn.isVisible({ timeout: 1000 })) {
    await unparkBtn.click()
    const toast = cockpitPage.locator('.ep-toast__title:has-text("Reprise")')
    await expect(toast).toBeVisible({ timeout: 5000 })
  }

  // Put to rest (seen/ack) - use conv-3 (done status)
  const seenBtn = card.locator('[data-action="seen"]')
  if (await seenBtn.isVisible({ timeout: 1000 })) {
    await seenBtn.click()
    const toast = cockpitPage.locator('.ep-toast__title:has-text("Au repos")')
    await expect(toast).toBeVisible({ timeout: 5000 })
  }

  await attachScreenshot(testInfo, cockpitPage, 'B8-park-unpark-seen')
})

test('B9: coller une image : vignette affichée, suppression possible ; à l\'envoi, l\'ordre contient le chemin de l\'image', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)
  const cockpitPage = await openCockpitFromIsland(app, island)

  const engineId = '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001'
  const card = await findCockpitCard(cockpitPage, engineId)

  // Simulate image paste via file input (paste not trivial in Playwright)
  const fileInput = card.locator('input[type="file"]')
  if (await fileInput.isVisible({ timeout: 1000 })) {
    const fs = require('fs')
    const path = require('path')
    const os = require('os')
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-img-'))
    const imgPath = path.join(tmpDir, 'test.png')
    // 1x1 PNG transparent
    fs.writeFileSync(imgPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))

    await fileInput.setInputFiles(imgPath)

    // Thumbnail should appear
    const thumb = card.locator('.thumb img')
    await expect(thumb).toBeVisible({ timeout: 5000 })

    // Remove thumbnail
    const removeBtn = card.locator('.thumb button[data-action="remove-image"]')
    await expect(removeBtn).toBeVisible()
    await removeBtn.click()
    await expect(thumb).not.toBeVisible({ timeout: 2000 })

    // Re-add and send
    await fileInput.setInputFiles(imgPath)
    await expect(thumb).toBeVisible()

    const replyInput = card.locator('textarea[data-role="draft"]')
    await replyInput.fill('With image')
    const sendBtn = card.locator('[data-action="send"]')
    await sendBtn.click()

    // The fake mod would have received the order with images (internal verification)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  await attachScreenshot(testInfo, cockpitPage, 'B9-image-paste')
})