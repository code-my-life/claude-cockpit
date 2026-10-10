const { test } = require('node:test')
const assert = require('node:assert/strict')
const { islandBoundsOf, collapsedBoundsOf, OPEN_SPRING, CLOSE_SPRING, TOAST_GAP } = require('./bounds')

const AREA = { x: 0, y: 0, width: 1920, height: 1040 }
const SIZES = { compactWidth: 320, compactHeight: 44, openWidth: 760, openHeight: 280 }
const centered = (area, width) => area.x + Math.round((area.width - width) / 2)

test('reduite : la fenetre est exactement la pastille, collee au bord haut, centree', () => {
  assert.deepEqual(islandBoundsOf(AREA, { ...SIZES, phase: 'compact' }), { x: centered(AREA, 320), y: 0, width: 320, height: 44 })
})

test('ouverte : la fenetre est exactement l ile ouverte, au meme centre', () => {
  const compact = islandBoundsOf(AREA, { ...SIZES, phase: 'compact' })
  const open = islandBoundsOf(AREA, { ...SIZES, phase: 'open' })
  assert.deepEqual([open.width, open.height], [760, 280])
  assert.equal(open.x + open.width / 2, compact.x + compact.width / 2)
})

test('toasts : la fenetre s elargit au moins a la largeur des toasts et s allonge de leur hauteur', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'compact', toastWidth: 380, toastHeight: 120 })
  assert.equal(bounds.width, 380 + 2 * TOAST_GAP)
  assert.equal(bounds.height, 44 + TOAST_GAP + 120)
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

test('dimensions absurdes : repli sur des valeurs sures', () => {
  const bounds = islandBoundsOf(AREA, { compactWidth: NaN, compactHeight: -5, openWidth: undefined, openHeight: NaN, phase: 'open' })
  assert.ok(bounds.width > 0 && bounds.height > 0)
})

test('rétractée : la meme largeur et le meme centre, hauteur de 1 px', () => {
  const bounds = islandBoundsOf(AREA, { ...SIZES, phase: 'open' })
  assert.deepEqual(collapsedBoundsOf(bounds), { ...bounds, height: 1 })
})

test('ressorts du systeme : 300 ms a l ouverture, 260 ms au repli, sans depassement fort', () => {
  assert.equal(OPEN_SPRING.ms, 300)
  assert.equal(CLOSE_SPRING.ms, 260)
  assert.ok(OPEN_SPRING.zeta < 1 && CLOSE_SPRING.zeta >= OPEN_SPRING.zeta)
})
