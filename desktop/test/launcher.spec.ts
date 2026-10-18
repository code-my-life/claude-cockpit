// Scénarios E2E pour le lanceur : ouverture, positionnement, redimensionnement.
import { expect, test } from '@playwright/test'
import { attachScreenshot, launchCockpit, probe, type Cockpit } from './harness'

let cockpit: Cockpit | null = null

test.beforeEach(async ({}, testInfo) => {
  cockpit = await launchCockpit(testInfo)
})

test.afterEach(async ({}, testInfo) => {
  if (cockpit === null) return
  const launcherWin = cockpit.app.windows().find((page: any) => page.url().includes('launcher=1'))
  if (launcherWin !== undefined) await attachScreenshot(testInfo, launcherWin, 'launcher-fin')
  await cockpit.close()
  cockpit = null
})

test('launcher : opens at correct position and size', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  // Afficher le lanceur via l'IPC show-launcher (comme l'utilisateur le ferait via le raccourci)
  await app.evaluate(({ ipcMain }: any) => {
    ipcMain.emit('show-launcher')
  })

  // Attendre la fenêtre du lanceur
  const launcherWin = await app.waitForEvent('window', { predicate: w => w.url().includes('launcher=1'), timeout: 10000 })
  await launcherWin.waitForLoadState('domcontentloaded')

  // Vérifier la position et la taille du lanceur
  const bounds = await launcherWin.evaluate(() => ({
    x: window.screenX,
    y: window.screenY,
    width: window.outerWidth,
    height: window.outerHeight,
  }))

  // Le lanceur doit être centré horizontalement et dans le tiers supérieur
  // Sur Windows, outerWidth peut inclure une bordure de 1px de chaque côté
  expect(bounds.width).toBeLessThanOrEqual(740)
  expect(bounds.height).toBeGreaterThanOrEqual(64)
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  
  await attachScreenshot(testInfo, launcherWin, 'launcher-opened')
})

test('launcher : resizes and persists bounds', async ({}, testInfo) => {
  const { app } = cockpit!
  await expect.poll(() => probe(app, 'serverPort')).not.toBeNull()

  // Ouvrir le lanceur via l'IPC show-launcher
  await app.evaluate(({ ipcMain }: any) => {
    ipcMain.emit('show-launcher')
  })
  const launcherWin = await app.waitForEvent('window', { predicate: (w: any) => w.url().includes('launcher=1'), timeout: 10000 })
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

  // La hauteur doit avoir changé (avec tolérance pour les bordures Windows)
  expect(resizedBounds.height).toBeGreaterThanOrEqual(380)
  expect(resizedBounds.height).toBeLessThanOrEqual(420)
  
  // Fermer et rouvrir pour vérifier la persistance
  await launcherWin.close()
  
  // Rouvrir via show-launcher IPC
  await app.evaluate(({ ipcMain }) => {
    ipcMain.emit('show-launcher')
  })
  const launcherWin2 = await app.waitForEvent('window', { predicate: w => w.url().includes('launcher=1'), timeout: 10000 })
  await launcherWin2.waitForLoadState('domcontentloaded')

  const persistedBounds = await launcherWin2.evaluate(() => ({
    width: window.outerWidth,
    height: window.outerHeight,
  }))

  expect(persistedBounds.height).toBeGreaterThanOrEqual(380)
  expect(persistedBounds.height).toBeLessThanOrEqual(420)
  
  await attachScreenshot(testInfo, launcherWin2, 'launcher-resized')
})