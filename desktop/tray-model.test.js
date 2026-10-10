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
  const menu = trayMenuOf({ isIslandVisible: true, isAutostart: false })
  const labels = menu.filter(item => item.label).map(item => item.label)
  assert.deepEqual(labels, ['Ouvrir le cockpit', "Afficher l'île", "Masquer l'île", 'Lancer au démarrage', 'Couper les sons', 'Quitter'])
})

test('the tray menu follows the state of the team and of the start with the session', () => {
  const menu = trayMenuOf({ isIslandVisible: false, isAutostart: true })
  assert.equal(menu.find(item => item.id === 'toggle-island').label, "Remontrer l'île")
  const autostart = menu.find(item => item.id === 'autostart')
  assert.equal(autostart.type, 'checkbox')
  assert.equal(autostart.checked, true)
})

test('opening in the browser is offered only when the app serves the cockpit itself', () => {
  const served = trayMenuOf({ isIslandVisible: true, isAutostart: false, canOpenInBrowser: true })
  assert.equal(served[1].label, 'Ouvrir dans le navigateur')
  const fallback = trayMenuOf({ isIslandVisible: true, isAutostart: false, canOpenInBrowser: false })
  assert.ok(!fallback.some(item => item.id === 'open-browser'))
})

test('installing the mod is offered only while it is not installed', () => {
  const missing = trayMenuOf({ isIslandVisible: true, isAutostart: false, canInstallMod: true })
  assert.ok(missing.some(item => item.id === 'install-mod' && item.label === 'Installer le mod dans Claude'))
  const installed = trayMenuOf({ isIslandVisible: true, isAutostart: false, canInstallMod: false })
  assert.ok(!installed.some(item => item.id === 'install-mod'))
})

test('quitting is set apart from the other actions', () => {
  const menu = trayMenuOf({ isIslandVisible: true, isAutostart: false })
  const quitIndex = menu.findIndex(item => item.id === 'quit')
  assert.equal(quitIndex, menu.length - 1)
  assert.equal(menu[quitIndex - 1].type, 'separator')
})

test('the tray menu offers to show the island, for keyboard access', () => {
  const menu = trayMenuOf({ isIslandVisible: false, isAutostart: false })
  const entry = menu.find(item => item.id === 'show-island')
  assert.equal(entry.label, "Afficher l'île")
  assert.ok(menu.indexOf(entry) < menu.findIndex(item => item.id === 'quit'))
})

test('the tray menu offers to mute the sounds, or to turn them back on', () => {
  const on = trayMenuOf({ isIslandVisible: true, isAutostart: false, areSoundsOn: true })
  assert.equal(on.find(item => item.id === 'toggle-sounds').label, 'Couper les sons')
  const off = trayMenuOf({ isIslandVisible: true, isAutostart: false, areSoundsOn: false })
  assert.equal(off.find(item => item.id === 'toggle-sounds').label, 'Activer les sons')
})

test('the sound entry comes before the separator and quit, and sounds count as on by default', () => {
  const menu = trayMenuOf({ isIslandVisible: true, isAutostart: false })
  const ids = menu.map(item => item.id)
  assert.ok(ids.indexOf('toggle-sounds') > ids.indexOf('autostart'))
  assert.ok(ids.indexOf('toggle-sounds') < ids.indexOf('quit'))
  assert.equal(menu.find(item => item.id === 'toggle-sounds').label, 'Couper les sons')
})
