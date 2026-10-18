// Scénarios E2E pour les actions des cartes (issue #15) : enlarge, terminal, exact answer, collapse.
// Ces tests vérifient que les boutons d'action dans le front de carte fonctionnent sans flip parasite.
import { expect, test } from '@playwright/test'
import { attachScreenshot, cockpitWindow, launchCockpit, probe, type Cockpit } from './harness'
import { mockConversations } from '../structured-data'

let cockpit: Cockpit | null = null

test.beforeEach(async ({}, testInfo) => {
  cockpit = await launchCockpit(testInfo)
})

test.afterEach(async ({}, testInfo) => {
  if (cockpit === null) return
  const cockpitWin = cockpit.app.windows().find(page => page.url().includes('cockpit') || (!page.url().includes('island=1') && !page.url().includes('launcher=1') && page.url().startsWith('http')))
  if (cockpitWin !== undefined) await attachScreenshot(testInfo, cockpitWin, 'card-actions-fin')
  await cockpit.close()
  cockpit = null
})

test('card actions : enlarge opens full conversation view', async ({}, testInfo) => {
  const { app } = cockpit!
  const win = await cockpitWindow(app)
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  // Attendre que la carte soit rendue et cliquer sur le bouton enlarge
  const enlargeBtn = win.locator('[data-testid="card-enlarge"]')
  await expect(enlargeBtn).toBeVisible()
  await enlargeBtn.click()

  // Vérifier que la conversation s'agrandit (bigId est défini)
  await expect.poll(() => probe(app, 'islandPhase')).toBe('compact')
  await attachScreenshot(testInfo, win, 'card-enlarge')
})

test('card actions : open terminal launches session terminal', async ({}, testInfo) => {
  const { app } = cockpit!
  const win = await cockpitWindow(app)
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const terminalBtn = win.locator('[data-testid="card-terminal"]')
  await expect(terminalBtn).toBeVisible()
  await terminalBtn.click()

  // Vérifier que le terminal s'ouvre pour la session
  await expect.poll(() => probe(app, 'islandPhase')).toBe('compact')
  await attachScreenshot(testInfo, win, 'card-terminal')
})

test('card actions : exact answer expands last message', async ({}, testInfo) => {
  const { app } = cockpit!
  const win = await cockpitWindow(app)
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const exactBtn = win.locator('[data-testid="card-exact-answer"]')
  await expect(exactBtn).toBeVisible()
  await exactBtn.click()

  // Vérifier que le dernier message s'agrandit (exact answer)
  await expect.poll(() => probe(app, 'islandPhase')).toBe('open')
  await attachScreenshot(testInfo, win, 'card-exact-answer')
})

test('card actions : collapse shrinks front to compact (no flip)', async ({}, testInfo) => {
  const { app } = cockpit!
  const win = await cockpitWindow(app)
  const html = win.locator('html')

  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  // Ouvrir la carte en mode expanded (cliquer sur enlarge)
  const enlargeBtn = win.locator('[data-testid="card-enlarge"]')
  await expect(enlargeBtn).toBeVisible()
  await enlargeBtn.click()
  await expect.poll(() => probe(app, 'islandPhase')).toBe('open')
  await attachScreenshot(testInfo, win, 'card-expanded-before-collapse')

  // Cliquer sur le bouton collapse
  const collapseBtn = win.locator('[data-testid="card-collapse"]')
  await expect(collapseBtn).toBeVisible()
  await collapseBtn.click()

  // VÉRIFICATION CRITIQUE : la carte doit passer en compact SANS flipper (pas de sg-flip)
  // Le bug #15 : le wrapper de carte avale les clics et toggle sg-flip sur tout clic dans le front
  await expect(html).not.toHaveAttribute('data-island', 'open', { timeout: 5000 })
  expect(await probe(app, 'islandPhase')).toBe('compact')
  
  // Vérifier qu'il n'y a PAS de classe sg-flip sur la carte (pas de flip parasite)
  const cardFront = win.locator('.card-front')
  await expect(cardFront).not.toHaveClass(/sg-flip/)
  
  await attachScreenshot(testInfo, win, 'card-collapsed-no-flip')
})