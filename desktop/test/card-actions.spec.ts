// Scénarios E2E pour les actions des cartes (issue #15) : enlarge, terminal, exact answer, collapse.
// Ces tests vérifient que les boutons d'action dans le front de carte fonctionnent sans flip parasite.
import { expect, test } from '@playwright/test'
import { attachScreenshot, islandWindow, launchCockpit, probe, type Cockpit } from './harness'

let cockpit: Cockpit | null = null

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

// Ouvrir l'île et attendre qu'elle soit en phase 'open' (cartes visibles)
async function openIsland(app: any) {
  const island: any = await islandWindow(app)
  // L'île démarre en compact. Cliquer sur le bouton compact pour l'ouvrir.
  const compactBtn = island.locator('#compactBtn')
  await expect(compactBtn).toBeVisible()
  await compactBtn.click()
  // Attendre que l'île soit ouverte (data-island="open")
  const html = island.locator('html')
  await expect(html).toHaveAttribute('data-island', 'open')
  await expect.poll(() => probe(app, 'islandPhase')).toBe('open')
  // Attendre que les données de l'île soient chargées (cartes avec boutons rendues)
  await expect.poll(() => probe(app, 'islandHasCards')).toBe(true)
  return island
}

// Trouver une carte par son engineId (première conversation mock)
async function findCard(island: any, engineId: string) {
  const card = island.locator(`sg-flip[data-engine="${engineId}"]`)
  // Attendre que la carte soit rendue avec ses boutons d'action
  await expect(card).toBeVisible({ timeout: 10000 })
  // Attendre que le bouton enlarge soit présent (signe que frontHtmlOf a injecté les boutons)
  await expect(card.locator('[data-testid="card-enlarge"]')).toBeVisible({ timeout: 10000 })
  return card
}

test('card actions : enlarge opens full conversation view', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)
  // Utiliser l'engineId réel du fixture (sessionId du transcript)
  const engineId = '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001'
  const card = await findCard(island, engineId)

  // Le bouton enlarge (agrandir) - data-action="big"
  const enlargeBtn = card.locator('[data-testid="card-enlarge"]')
  await expect(enlargeBtn).toBeVisible()
  await enlargeBtn.click()

  // Vérifier que la carte a la classe 'big' (agrandie)
  await expect(card).toHaveClass(/big/)
  // Le bouton doit maintenant afficher "Réduire"
  await expect(enlargeBtn).toHaveText(/Réduire/)

  await attachScreenshot(testInfo, island, 'card-enlarge')
})

test('card actions : open terminal launches session terminal', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)
  const engineId = '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001'
  const card = await findCard(island, engineId)

  const terminalBtn = card.locator('[data-testid="card-terminal"]')
  await expect(terminalBtn).toBeVisible()
  await terminalBtn.click()

  // Vérifier qu'une action terminal a été déclenchée (l'envoi IPC ne peut pas être vérifié directement,
  // mais on peut vérifier que le bouton a réagi - pas de flip parasite)
  const cardFront = card.locator('.conv-card-body')
  await expect(cardFront).not.toHaveClass(/sg-flip/)

  await attachScreenshot(testInfo, island, 'card-terminal')
})

test('card actions : exact answer expands last message', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  const island = await openIsland(app)
  const engineId = '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001'
  const card = await findCard(island, engineId)

  const exactBtn = card.locator('[data-testid="card-exact-answer"]')
  await expect(exactBtn).toBeVisible()
  await exactBtn.click()

  // Vérifier que le bouton exact answer a aria-expanded="true"
  await expect(exactBtn).toHaveAttribute('aria-expanded', 'true')

  await attachScreenshot(testInfo, island, 'card-exact-answer')
})

test('card actions : collapse shrinks front to compact (no flip)', async ({}, testInfo) => {
  const { app } = cockpit!
  const island = await openIsland(app)
  const engineId = '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001'
  const card = await findCard(island, engineId)

  // D'abord agrandir la carte
  const enlargeBtn = card.locator('[data-testid="card-enlarge"]')
  await expect(enlargeBtn).toBeVisible()
  await enlargeBtn.click()
  await expect(card).toHaveClass(/big/)
  await attachScreenshot(testInfo, island, 'card-expanded-before-collapse')

  // Cliquer sur le bouton collapse (data-testid="card-collapse", data-action="toggle")
  const collapseBtn = card.locator('[data-testid="card-collapse"]')
  await expect(collapseBtn).toBeVisible()
  await collapseBtn.click()

  // VÉRIFICATION CRITIQUE : la carte doit passer en compact SANS flipper (pas de sg-flip)
  // Le bug #15 : le wrapper de carte avale les clics et toggle sg-flip sur tout clic dans le front
  await expect(card).not.toHaveClass(/big/)

  // Vérifier qu'il n'y a PAS de classe sg-flip sur la carte (pas de flip parasite)
  const cardFront = card.locator('.conv-card-body')
  await expect(cardFront).not.toHaveClass(/sg-flip/)

  await attachScreenshot(testInfo, island, 'card-collapsed-no-flip')
})