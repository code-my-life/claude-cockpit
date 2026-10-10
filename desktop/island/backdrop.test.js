const { test } = require('node:test')
const assert = require('node:assert/strict')
const { themeOf, sampleRectsOf, LIGHT_ABOVE, DARK_BELOW } = require('./backdrop')

test('le theme suit le bureau avec une hysteresis : pas de va-et-vient autour du seuil', () => {
  assert.equal(themeOf('dark', LIGHT_ABOVE + 0.01), 'light')
  assert.equal(themeOf('dark', LIGHT_ABOVE - 0.01), 'dark')
  assert.equal(themeOf('light', DARK_BELOW + 0.01), 'light')
  assert.equal(themeOf('light', DARK_BELOW - 0.01), 'dark')
  assert.ok(DARK_BELOW < LIGHT_ABOVE)
})

test('sans mesure le theme reste celui d avant', () => {
  assert.equal(themeOf('light', null), 'light')
  assert.equal(themeOf('dark', null), 'dark')
})

test('les zones de mesure bordent l ile a gauche et a droite, dans la bande du haut', () => {
  const rects = sampleRectsOf({ x: 1000, y: 0, width: 400, height: 50 }, { x: 0, y: 0, width: 3000, height: 1000 })
  assert.equal(rects.length, 2)
  assert.ok(rects[0].x + rects[0].width <= 1000 && rects[1].x >= 1400)
  for (const rect of rects) assert.ok(rect.y >= 0 && rect.y + rect.height <= 1000)
})

test('au bord de l ecran une seule zone suffit', () => {
  const rects = sampleRectsOf({ x: 0, y: 0, width: 400, height: 50 }, { x: 0, y: 0, width: 3000, height: 1000 })
  assert.equal(rects.length, 1)
})

const { gridPointsOf, meanLuminanceOf } = require('./backdrop')

test('une grille de points au milieu de chaque zone, sans toucher les bords', () => {
  const points = gridPointsOf([{ x: 100, y: 10, width: 80, height: 16 }], 4, 2)
  assert.equal(points.length, 8)
  for (const point of points) assert.ok(point.x > 100 && point.x < 180 && point.y > 10 && point.y < 26)
  assert.equal(new Set(points.map(point => `${point.x},${point.y}`)).size, 8)
})

test('luminance moyenne de couleurs lues sur l ecran : blanc 1, noir 0, trous ignores', () => {
  assert.ok(Math.abs(meanLuminanceOf([[255, 255, 255], [255, 255, 255]]) - 1) < 0.001)
  assert.equal(meanLuminanceOf([[0, 0, 0]]), 0)
  assert.ok(Math.abs(meanLuminanceOf([[255, 255, 255], null, [0, 0, 0]]) - 0.5) < 0.01)
  assert.equal(meanLuminanceOf([null, null]), null)
  assert.equal(meanLuminanceOf([]), null)
})

test('les zones se mesurent aussi en pixels reels de l ecran (unite de 4)', () => {
  const rects = sampleRectsOf({ x: 1000, y: 0, width: 400, height: 50 }, { x: 0, y: 0, width: 3000, height: 1000 }, 4)
  assert.equal(rects.length, 2)
  assert.equal(rects[0].width, 320)
})
