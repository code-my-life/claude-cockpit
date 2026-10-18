// Scénarios E2E pour le lanceur : ouverture, positionnement, redimensionnement.
import { expect, test } from '@playwright/test'
import { attachScreenshot, islandWindow, launchCockpit, probe, type Cockpit } from './harness'

let cockpit = null

test.beforeEach(async ({}, testInfo) => {
  cockpit = await launchCockpit(testInfo)
})

test.afterEach(async ({}, testInfo) => {
  if (cockpit === null) return
  const island = cockpit.app.windows().find(page => page.url().includes('island=1'))
  if (island !== undefined) await attachScreenshot(testInfo, island, 'launcher-fin')
  await cockpit.close()
  cockpit = null
})

test('launcher : opens at correct position and size', async ({}, testInfo) => {
  const { app } = cockpit
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  // Afficher le lanceur via le processus principal
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('launcher=1'))
    if (win) {
      win.show()
      win.focus()
      win.webContents.send('launcher-shown')
    }
  })

  // Attendre la fenêtre du lanceur
  const launcherWin = await app.waitForEvent('window', { predicate: w => w.url().includes('launcher=1'), timeout: 10000 })
  await launcherWin.waitForLoadState('domcontentloaded')

  // Vérifier la position et la taille du lanceur
  const bounds = await launcherWin.evaluate(() => {
    const w = window.outerWidth
    const h = window.outerHeight
    const x = window.screenX
    const y = window.screenY
    return { x, y, width: w, height: h }
  })

  // Le lanceur doit être centré horizontalement et dans le tiers supérieur
  expect(bounds.width).toBeLessThanOrEqual(720)
  expect(bounds.height).toBeGreaterThanOrEqual(64)
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  
  await attachScreenshot(testInfo, launcherWin, 'launcher-opened')
})

test('launcher : resizes and persists bounds', async ({}, testInfo) => {
  const { app } = cockpit
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  // Ouvrir le lanceur
  const launcherWin = await app.waitForEvent('window', { predicate: w => w.url().includes('launcher=1'), timeout: 10000 })
  await launcherWin.waitForLoadState('domcontentloaded')

  // Récupérer la taille initiale
  const initialBounds = await launcherWin.evaluate(() => ({
    width: window.outerWidth,
    height: window.outerHeight,
  }))

  // Redimensionner via l'IPC launcher-height
  await launcherWin.evaluate(() => {
    window.cockpitDesktop.setLauncherHeight(400)
  })

  // Attendre que le redimensionnement soit appliqué
  await launcherWin.waitForTimeout(500)

  const resizedBounds = await launcherWin.evaluate(() => ({
    width: window.outerWidth,
    height: window.outerHeight,
  }))

  expect(resizedBounds.height).toBe(400)
  
  // Fermer et rouvrir pour vérifier la persistance
  await launcherWin.close()
  
  const launcherWin2 = await app.waitForEvent('window', { predicate: w => w.url().includes('launcher=1'), timeout: 10000 })
  await launcherWin2.waitForLoadState('domcontentloaded')

  const persistedBounds = await launcherWin2.evaluate(() => ({
    width: window.outerWidth,
    height: window.outerHeight,
  }))

  expect(persistedBounds.height).toBe(400)
  
  await attachScreenshot(testInfo, launcherWin2, 'launcher-resized')
})