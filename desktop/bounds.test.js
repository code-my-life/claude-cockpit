const { test } = require('node:test')
const assert = require('node:assert/strict')
const { islandBoundsOf, shapeRectsOf, settleDelayOf, ISLAND_PAD, SHEET_MAX_WIDTH, SHEET_MAX_HEIGHT, ISLAND_CLOSE_MS, SETTLE_SLACK_MS } = require('./bounds')

const AREA = { x: 0, y: 0, width: 1920, height: 1040 }
const SIZES = { dockWidth: 420, dockHeight: 96, sheetWidth: 900, sheetHeight: 600 }
const centered = (area, width) => area.x + Math.round((area.width - width) / 2)

test('reduit : taille du dock plus la marge d ombre, centree en haut', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'compact' })
  assert.equal(bounds.width, 420 + 2 * ISLAND_PAD)
  assert.equal(bounds.height, 96 + 2 * ISLAND_PAD)
  assert.equal(bounds.x, centered(AREA, bounds.width))
  assert.equal(bounds.y, 0)
})

test('ouvert : largeur de la fiche, hauteur dock plus fiche', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'open' })
  assert.equal(bounds.width, 900 + 2 * ISLAND_PAD)
  assert.equal(bounds.height, 96 + 600 + 3 * ISLAND_PAD)
  assert.equal(bounds.x, centered(AREA, bounds.width))
})

test('fiche plus etroite que le dock : le panneau prend la largeur du dock', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, sheetWidth: 380, phase: 'open' })
  assert.equal(bounds.width, 420 + 2 * ISLAND_PAD)
})

test('fiche trop grande : largeur et hauteur plafonnees', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, sheetWidth: 3000, sheetHeight: 3000, phase: 'open' })
  assert.equal(bounds.width, SHEET_MAX_WIDTH + 2 * ISLAND_PAD)
  assert.equal(bounds.height, 96 + SHEET_MAX_HEIGHT + 3 * ISLAND_PAD)
})

test('petit ecran : le panneau reste dans la zone utile', () => {
  const area = { x: 0, y: 0, width: 800, height: 500 }
  const bounds = islandBoundsOf(area, { ...SIZES, sheetWidth: 1000, sheetHeight: 800, phase: 'open' })
  assert.ok(bounds.width <= area.width && bounds.height <= area.height)
  assert.ok(bounds.x >= area.x && bounds.y >= area.y)
})

test('ecran decale : la fenetre est centree dans la zone utile de cet ecran', () => {
  const area = { x: -1920, y: 40, width: 1920, height: 1000 }
  const bounds = islandBoundsOf(area, { ...SIZES, phase: 'compact' })
  assert.equal(bounds.x, centered(area, bounds.width))
  assert.equal(bounds.y, 40)
})

test('dimensions absurdes : repli sur des valeurs sures', () => {
  const bounds = islandBoundsOf(AREA, { dockWidth: NaN, dockHeight: -5, sheetWidth: undefined, sheetHeight: NaN, phase: 'open' })
  assert.ok(bounds.width > 0 && bounds.height > 0)
})

test('agrandissement ou animations coupees : appliquer tout de suite', () => {
  assert.equal(settleDelayOf({ from: 'hidden', to: 'compact', hasReducedMotion: false }), 0)
  assert.equal(settleDelayOf({ from: 'compact', to: 'open', hasReducedMotion: false }), 0)
  assert.equal(settleDelayOf({ from: 'open', to: 'compact', hasReducedMotion: true }), 0)
})

test('repli : attendre la fin de l animation de fermeture', () => {
  const expected = ISLAND_CLOSE_MS + SETTLE_SLACK_MS
  assert.equal(settleDelayOf({ from: 'open', to: 'compact', hasReducedMotion: false }), expected)
  assert.equal(settleDelayOf({ from: 'compact', to: 'hidden', hasReducedMotion: false }), expected)
})

test('forme cachee : aucune zone, plus aucun pixel ne capte la souris', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'compact' })
  assert.deepEqual(shapeRectsOf(bounds, { ...SIZES, phase: 'hidden' }), [])
})

test('forme reduite : le dock centre, a la marge du haut', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'compact' })
  assert.deepEqual(shapeRectsOf(bounds, { ...SIZES, phase: 'compact' }), [{ x: ISLAND_PAD, y: ISLAND_PAD, width: 420, height: 96 }])
})

test('forme ouverte : le dock puis la fiche dessous, sur toute la largeur utile', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'open' })
  const [dock, sheet] = shapeRectsOf(bounds, { ...SIZES, phase: 'open' })
  assert.equal(dock.x, Math.round((bounds.width - 420) / 2))
  assert.deepEqual(sheet, { x: ISLAND_PAD, y: 96 + 2 * ISLAND_PAD, width: 900, height: 600 })
  assert.ok(sheet.y + sheet.height + ISLAND_PAD <= bounds.height)
})

test('forme : le dock ne depasse pas la fenetre sur un petit ecran', () => {
  const area = { x: 0, y: 0, width: 300, height: 500 }
  const bounds = islandBoundsOf(area, { ...SIZES, phase: 'compact' })
  const [dock] = shapeRectsOf(bounds, { ...SIZES, phase: 'compact' })
  assert.ok(dock.x >= 0 && dock.x + dock.width <= bounds.width)
})
