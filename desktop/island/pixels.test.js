const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readPixels, colorOf } = require('./pixels')

test('un COLORREF Windows (0x00BBGGRR) devient [r, g, b]', () => {
  assert.deepEqual(colorOf(0x00332211), [0x11, 0x22, 0x33])
  assert.deepEqual(colorOf(0x00ffffff), [255, 255, 255])
})

test('une lecture ratee (CLR_INVALID) devient un trou', () => {
  assert.equal(colorOf(0xffffffff), null)
})

test('les points sont lus sur le contexte de l ecran, qui est rendu ensuite', () => {
  const calls = []
  const load = () => ({
    getDc: () => { calls.push('dc'); return 7 },
    getPixel: (hdc, x, y) => { calls.push(`px ${hdc} ${x},${y}`); return 0x00020406 },
    releaseDc: (hwnd, hdc) => { calls.push(`release ${hdc}`); return 1 },
  })
  assert.deepEqual(readPixels([{ x: 1, y: 2 }, { x: 3, y: 4 }], 'win32', load), [[6, 4, 2], [6, 4, 2]])
  assert.deepEqual(calls, ['dc', 'px 7 1,2', 'px 7 3,4', 'release 7'])
})

test('sans koffi ou hors Windows : des trous, jamais d exception', () => {
  assert.deepEqual(readPixels([{ x: 1, y: 1 }], 'win32', () => { throw new Error('koffi absent') }), [null])
  assert.deepEqual(readPixels([{ x: 1, y: 1 }], 'linux'), [null])
})

test('pas de contexte d ecran : des trous', () => {
  assert.deepEqual(readPixels([{ x: 1, y: 1 }], 'win32', () => ({ getDc: () => null, getPixel: () => 0, releaseDc: () => 0 })), [null])
})
