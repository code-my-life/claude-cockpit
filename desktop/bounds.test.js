const { test } = require('node:test')
const assert = require('node:assert/strict')
const { islandBoundsOf, shapeRectsOf, settleDelayOf, STAGE_WIDTH, STAGE_HEIGHT, SHAPE_PAD, TOAST_GAP, ISLAND_CLOSE_MS, SETTLE_SLACK_MS } = require('./bounds')

const AREA = { x: 0, y: 0, width: 1920, height: 1040 }
const SIZES = { dockWidth: 320, dockHeight: 44, sheetWidth: 760, sheetHeight: 280 }
const centered = (area, width) => area.x + Math.round((area.width - width) / 2)

test('la fenetre a toujours la taille de la scene : elle ne change pas pendant la morphose', () => {
  const bounds = islandBoundsOf(AREA)
  assert.equal(bounds.width, STAGE_WIDTH)
  assert.equal(bounds.height, STAGE_HEIGHT)
  assert.equal(bounds.x, centered(AREA, STAGE_WIDTH))
  assert.equal(bounds.y, 0)
})

test('ecran decale : la scene est centree dans la zone utile de cet ecran, collee au bord haut', () => {
  const area = { x: -1920, y: 40, width: 1920, height: 1000 }
  const bounds = islandBoundsOf(area)
  assert.equal(bounds.x, centered(area, bounds.width))
  assert.equal(bounds.y, 40)
})

test('petit ecran : la scene reste dans la zone utile', () => {
  const area = { x: 0, y: 0, width: 500, height: 400 }
  const bounds = islandBoundsOf(area)
  assert.ok(bounds.width <= area.width && bounds.height <= area.height)
  assert.ok(bounds.x >= area.x && bounds.y >= area.y)
})

test('forme cachee : aucune zone, plus aucun pixel ne capte la souris', () => {
  const bounds = islandBoundsOf(AREA)
  assert.deepEqual(shapeRectsOf(bounds, { ...SIZES, phase: 'hidden' }), [])
})

test('forme reduite : la pastille, centree et collee au bord haut', () => {
  const bounds = islandBoundsOf(AREA)
  const [island] = shapeRectsOf(bounds, { ...SIZES, phase: 'compact' })
  assert.deepEqual(island, { x: Math.round((bounds.width - (320 + 2 * SHAPE_PAD)) / 2), y: 0, width: 320 + 2 * SHAPE_PAD, height: 44 + SHAPE_PAD })
})

test('forme ouverte : la taille ouverte, au meme endroit', () => {
  const bounds = islandBoundsOf(AREA)
  const [island] = shapeRectsOf(bounds, { ...SIZES, phase: 'open' })
  assert.equal(island.width, 760 + 2 * SHAPE_PAD)
  assert.equal(island.height, 280 + SHAPE_PAD)
  assert.equal(island.y, 0)
})

test('forme ouverte plus grande que la scene : plafonnee a la scene', () => {
  const bounds = islandBoundsOf(AREA)
  const [island] = shapeRectsOf(bounds, { ...SIZES, sheetWidth: 5000, sheetHeight: 5000, phase: 'open' })
  assert.ok(island.x >= 0 && island.x + island.width <= bounds.width)
  assert.ok(island.height <= bounds.height)
})

test('les toasts ajoutent une zone sous la forme, alignee a droite de la scene', () => {
  const bounds = islandBoundsOf(AREA)
  const shape = shapeRectsOf(bounds, { ...SIZES, phase: 'compact', toastWidth: 380, toastHeight: 120 })
  assert.equal(shape.length, 2)
  const [island, toasts] = shape
  assert.equal(toasts.y, island.height)
  assert.equal(toasts.x + toasts.width, bounds.width - TOAST_GAP)
  assert.equal(toasts.width, 380)
  assert.equal(toasts.height, TOAST_GAP + 120 + SHAPE_PAD)
})

test('sans toast : une seule zone', () => {
  const bounds = islandBoundsOf(AREA)
  assert.equal(shapeRectsOf(bounds, { ...SIZES, phase: 'open', toastWidth: 0, toastHeight: 0 }).length, 1)
})

test('dimensions absurdes : repli sur des valeurs sures', () => {
  const bounds = islandBoundsOf(AREA)
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
