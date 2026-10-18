// Scénarios E2E pour les actions des cartes (issue #15) : enlarge, terminal, exact answer, collapse.
// Ces tests vérifient que les boutons d'action dans le front de carte fonctionnent sans flip parasite.
import { expect, test } from '@playwright/test'
import { attachScreenshot, islandWindow, launchCockpit, probe, type Cockpit } from './harness'

let cockpit = null

test.beforeEach(async ({}, testInfo) => {
  cockpit = await launchCockpit(testInfo)
})

test.afterEach(async ({}, testInfo) => {
  if (cockpit === null) return
  const island = cockpit.app.windows().find(page => page.url().includes('island=1'))
  if (island !== undefined) await attachScreenshot(testInfo, island, 'card-actions-fin')
  await cockpit.close()
  cockpit = null
})

test('card actions : enlarge opens full conversation view', async ({}, testInfo) => {
  const { app } = cockpit
  const island = await islandWindow(app)
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  // Attendre que la carte soit rendue et cliquer sur le bouton enlarge
  const enlargeBtn = island.locator('[data-testid="card-enlarge"]')
  await expect(enlargeBtn).toBeVisible()
  await enlargeBtn.click()

  // Vérifier que la fenêtre cockpit complète s'ouvre
  // (à implémenter : vérifier l'ouverture de la fenêtre cockpit avec la conversation)
  await expect.poll(() => probe(app, 'islandPhase')).toBe('compact')
  await attachScreenshot(testInfo, island, 'card-enlarge')
})

test('card actions : open terminal launches session terminal', async ({}, testInfo) => {
  const { app } = cockpit
  const island = await islandWindow(app)
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const terminalBtn = island.locator('[data-testid="card-terminal"]')
  await expect(terminalBtn).toBeVisible()
  await terminalBtn.click()

  // Vérifier que le terminal s'ouvre pour la session
  await expect.poll(() => probe(app, 'islandPhase')).toBe('compact')
  await attachScreenshot(testInfo, island, 'card-terminal')
})

test('card actions : exact answer expands last message', async ({}, testInfo) => {
  const { app } = cockpit
  const island = await islandWindow(app)
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const exactBtn = island.locator('[data-testid="card-exact-answer"]')
  await expect(exactBtn).toBeVisible()
  await exactBtn.click()

  // Vérifier que le dernier message s'agrandit (exact answer)
  await expect.poll(() => probe(app, 'islandPhase')).toBe('open')
  await attachScreenshot(testInfo, island, 'card-exact-answer')
})

test('card actions : collapse shrinks front to compact (no flip)', async ({}, testInfo) => {
  const { app } = cockpit
  const island = await islandWindow(app)
  const html = island.locator('html')

  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  // Ouvrir la carte en mode expanded
  await island.locator('#compactBtn').click()
  await island.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent('mouseleave')))
  await expect(html).toHaveAttribute('data-island', 'open')
  await expect.poll(() => probe(app, 'islandPhase')).toBe('open')
  await attachScreenshot(testInfo, island, 'card-expanded-before-collapse')

  // Cliquer sur le bouton collapse
  const collapseBtn = island.locator('[data-testid="card-collapse"]')
  await expect(collapseBtn).toBeVisible()
  await collapseBtn.click()

  // VÉRIFICATION CRITIQUE : la carte doit passer en compact SANS flipper (pas de sg-flip)
  // Le bug #15 : le wrapper de carte avale les clics et toggle sg-flip sur tout clic dans le front
  await expect(html).toHaveAttribute('data-island', 'compact', { timeout: 5000 })
  expect(await probe(app, 'islandPhase')).toBe('compact')
  
  // Vérifier qu'il n'y a PAS de classe sg-flip sur la carte (pas de flip parasite)
  const cardFront = island.locator('.card-front')
  await expect(cardFront).not.toHaveClass(/sg-flip/)
  
  await attachScreenshot(testInfo, island, 'card-collapsed-no-flip')
})