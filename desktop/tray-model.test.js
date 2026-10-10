const { test } = require('node:test')
const assert = require('node:assert/strict')
const { trayIconBitmap, trayMenuOf, TRAY_ICON_SIZE } = require('./tray-model')

const BYTES_PER_PIXEL = 4
const ALPHA = 3

const alphaAt = (bitmap, x, y) => bitmap[(y * TRAY_ICON_SIZE + x) * BYTES_PER_PIXEL + ALPHA]

test('the tray icon is a square bitmap with four bytes per pixel', () => {
  const bitmap = trayIconBitmap(TRAY_ICON_SIZE)
  assert.equal(bitmap.length, TRAY_ICON_SIZE * TRAY_ICON_SIZE * BYTES_PER_PIXEL)
})

test('the tray icon is an ink ring: drawn on the ring, clear in the corners and at the centre', () => {
  const bitmap = trayIconBitmap(TRAY_ICON_SIZE)
  const centre = TRAY_ICON_SIZE / 2
  assert.equal(alphaAt(bitmap, 0, 0), 0)
  assert.equal(alphaAt(bitmap, centre, centre), 0)
  assert.equal(alphaAt(bitmap, centre, 3), 255)
})

test('the tray menu offers to open, show the team, start with the session and quit', () => {
  const menu = trayMenuOf({ isDockVisible: true, isAutostart: false })
  const labels = menu.filter(item => item.label).map(item => item.label)
  assert.deepEqual(labels, ['Ouvrir le cockpit', 'Masquer la mini-équipe', 'Lancer au démarrage', 'Quitter'])
})

test('the tray menu follows the state of the team and of the start with the session', () => {
  const menu = trayMenuOf({ isDockVisible: false, isAutostart: true })
  assert.equal(menu.find(item => item.id === 'toggle-dock').label, 'Afficher la mini-équipe')
  const autostart = menu.find(item => item.id === 'autostart')
  assert.equal(autostart.type, 'checkbox')
  assert.equal(autostart.checked, true)
})

test('opening in the browser is offered only when the app serves the cockpit itself', () => {
  const served = trayMenuOf({ isDockVisible: true, isAutostart: false, canOpenInBrowser: true })
  assert.equal(served[1].label, 'Ouvrir dans le navigateur')
  const fallback = trayMenuOf({ isDockVisible: true, isAutostart: false, canOpenInBrowser: false })
  assert.ok(!fallback.some(item => item.id === 'open-browser'))
})

test('installing the mod is offered only while it is not installed', () => {
  const missing = trayMenuOf({ isDockVisible: true, isAutostart: false, canInstallMod: true })
  assert.ok(missing.some(item => item.id === 'install-mod' && item.label === 'Installer le mod dans Claude'))
  const installed = trayMenuOf({ isDockVisible: true, isAutostart: false, canInstallMod: false })
  assert.ok(!installed.some(item => item.id === 'install-mod'))
})

test('quitting is set apart from the other actions', () => {
  const menu = trayMenuOf({ isDockVisible: true, isAutostart: false })
  const quitIndex = menu.findIndex(item => item.id === 'quit')
  assert.equal(quitIndex, menu.length - 1)
  assert.equal(menu[quitIndex - 1].type, 'separator')
})
