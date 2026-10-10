const { test } = require('node:test')
const assert = require('node:assert/strict')
const { luminanceOf, themeOf, sampleRectsOf, LIGHT_ABOVE, DARK_BELOW } = require('./backdrop')

// Image BGRA factice : tout d'une couleur, sauf une zone.
const imageOf = (width, height, rgb, paint = () => null) => {
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y) || rgb
      const at = (y * width + x) * 4
      data[at] = b; data[at + 1] = g; data[at + 2] = r; data[at + 3] = 255
    }
  }
  return { data, width, height }
}

test('un fond blanc a une luminance de 1, un fond noir de 0', () => {
  assert.ok(Math.abs(luminanceOf(imageOf(10, 10, [255, 255, 255]), { x: 0, y: 0, width: 10, height: 10 }) - 1) < 0.001)
  assert.equal(luminanceOf(imageOf(10, 10, [0, 0, 0]), { x: 0, y: 0, width: 10, height: 10 }), 0)
})

test('seule la zone demandee compte', () => {
  const image = imageOf(20, 10, [0, 0, 0], x => (x >= 10 ? [255, 255, 255] : null))
  assert.equal(luminanceOf(image, { x: 0, y: 0, width: 10, height: 10 }), 0)
  assert.ok(luminanceOf(image, { x: 10, y: 0, width: 10, height: 10 }) > 0.99)
})

test('plusieurs zones : moyenne pondérée par leur surface, zones hors image ignorees', () => {
  const image = imageOf(20, 10, [0, 0, 0], x => (x >= 10 ? [255, 255, 255] : null))
  const mean = luminanceOf(image, [{ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 }, { x: 500, y: 0, width: 10, height: 10 }])
  assert.ok(Math.abs(mean - 0.5) < 0.01)
})

test('aucune zone exploitable : pas de mesure', () => {
  assert.equal(luminanceOf(imageOf(4, 4, [255, 255, 255]), [{ x: 100, y: 100, width: 5, height: 5 }]), null)
})

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
