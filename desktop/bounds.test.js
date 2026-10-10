const { test } = require('node:test')
const assert = require('node:assert/strict')
const { islandBoundsOf, shapeRectsOf, settleDelayOf, SHAPE_PAD, TOAST_GAP, ISLAND_CLOSE_MS, SETTLE_SLACK_MS } = require('./bounds')

const AREA = { x: 0, y: 0, width: 1920, height: 1040 }
const SIZES = { dockWidth: 320, dockHeight: 44, sheetWidth: 760, sheetHeight: 280 }
const centered = (area, width) => area.x + Math.round((area.width - width) / 2)

test('reduite : la fenetre est la pastille et sa marge, collee au bord haut, centree', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'compact' })
  assert.equal(bounds.width, 320 + 2 * SHAPE_PAD)
  assert.equal(bounds.height, 44 + SHAPE_PAD)
  assert.equal(bounds.x, centered(AREA, bounds.width))
  assert.equal(bounds.y, 0)
})

test('ouverte : la fenetre prend la taille de l ile ouverte, au meme centre', () => {
  const compact = islandBoundsOf(AREA, { ...SIZES, phase: 'compact' })
  const open = islandBoundsOf(AREA, { ...SIZES, phase: 'open' })
  assert.equal(open.width, 760 + 2 * SHAPE_PAD)
  assert.equal(open.height, 280 + SHAPE_PAD)
  assert.equal(open.x + open.width / 2, compact.x + compact.width / 2)
})

test('toasts : la fenetre s elargit au moins a la largeur des toasts et s allonge de leur hauteur', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'compact', toastWidth: 380, toastHeight: 120 })
  assert.equal(bounds.width, 380 + 2 * TOAST_GAP)
  assert.equal(bounds.height, 44 + SHAPE_PAD + TOAST_GAP + 120 + SHAPE_PAD)
})

test('ecran decale : la fenetre est centree dans la zone utile de cet ecran, collee au bord haut', () => {
  const area = { x: -1920, y: 40, width: 1920, height: 1000 }
  const bounds = islandBoundsOf(area, { ...SIZES, phase: 'open' })
  assert.equal(bounds.x, centered(area, bounds.width))
  assert.equal(bounds.y, 40)
})

test('petit ecran : la fenetre reste dans la zone utile', () => {
  const area = { x: 0, y: 0, width: 500, height: 200 }
  const bounds = islandBoundsOf(area, { ...SIZES, phase: 'open' })
  assert.ok(bounds.width <= area.width && bounds.height <= area.height)
  assert.ok(bounds.x >= area.x && bounds.y >= area.y)
})

test('forme cachee : aucune zone, plus aucun pixel ne capte la souris', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'open', toastWidth: 380, toastHeight: 120 })
  assert.deepEqual(shapeRectsOf(bounds, { ...SIZES, phase: 'hidden' }), [])
})

test('forme reduite : la pastille, centree et collee au bord haut', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'open', toastWidth: 380, toastHeight: 120 })
  const [island] = shapeRectsOf(bounds, { ...SIZES, phase: 'compact' })
  assert.deepEqual(island, { x: Math.round((bounds.width - (320 + 2 * SHAPE_PAD)) / 2), y: 0, width: 320 + 2 * SHAPE_PAD, height: 44 + SHAPE_PAD })
})

test('forme ouverte : la taille ouverte, au meme endroit', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'open', toastWidth: 380, toastHeight: 120 })
  const [island] = shapeRectsOf(bounds, { ...SIZES, phase: 'open' })
  assert.equal(island.width, 760 + 2 * SHAPE_PAD)
  assert.equal(island.height, 280 + SHAPE_PAD)
  assert.equal(island.y, 0)
})

test('forme ouverte plus grande que la scene : plafonnee a la scene', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'open', toastWidth: 380, toastHeight: 120 })
  const [island] = shapeRectsOf(bounds, { ...SIZES, sheetWidth: 5000, sheetHeight: 5000, phase: 'open' })
  assert.ok(island.x >= 0 && island.x + island.width <= bounds.width)
  assert.ok(island.height <= bounds.height)
})

test('les toasts ajoutent une zone sous la forme, alignee a droite de la scene', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'open', toastWidth: 380, toastHeight: 120 })
  const shape = shapeRectsOf(bounds, { ...SIZES, phase: 'compact', toastWidth: 380, toastHeight: 120 })
  assert.equal(shape.length, 2)
  const [island, toasts] = shape
  assert.equal(toasts.y, island.height)
  assert.equal(toasts.x + toasts.width, bounds.width - TOAST_GAP)
  assert.equal(toasts.width, 380)
  assert.equal(toasts.height, TOAST_GAP + 120 + SHAPE_PAD)
})

test('sans toast : une seule zone', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'open', toastWidth: 380, toastHeight: 120 })
  assert.equal(shapeRectsOf(bounds, { ...SIZES, phase: 'open', toastWidth: 0, toastHeight: 0 }).length, 1)
})

test('dimensions absurdes : repli sur des valeurs sures', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'open', toastWidth: 380, toastHeight: 120 })
  const [island] = shapeRectsOf(bounds, { dockWidth: NaN, dockHeight: -5, sheetWidth: undefined, sheetHeight: NaN, phase: 'open' })
  assert.ok(bounds.width > 0 && island.width > 0 && island.height > 0)
})

test('agrandissement ou animations coupees : appliquer tout de suite', () => {
  assert.equal(settleDelayOf({ from: 'hidden', to: 'compact', hasReducedMotion: false }), 0)
  assert.equal(settleDelayOf({ from: 'compact', to: 'open', hasReducedMotion: false }), 0)
  assert.equal(settleDelayOf({ from: 'open', to: 'compact', hasReducedMotion: true }), 0)
})

test('repli : attendre la fin de l animation de fermeture (ressort de 260 ms)', () => {
  assert.equal(ISLAND_CLOSE_MS, 260)
  const expected = ISLAND_CLOSE_MS + SETTLE_SLACK_MS
  assert.equal(settleDelayOf({ from: 'open', to: 'compact', hasReducedMotion: false }), expected)
  assert.equal(settleDelayOf({ from: 'compact', to: 'hidden', hasReducedMotion: false }), expected)
})
