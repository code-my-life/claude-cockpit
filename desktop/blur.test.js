const { test } = require('node:test')
const assert = require('node:assert/strict')
const { accentOf, applyBlur, ACCENT_ACRYLIC, WCA_ACCENT_POLICY, NIGHT_TINT } = require('./blur')

const windowOf = () => {
  const materials = []
  const handle = Buffer.alloc(8)
  handle.writeBigUInt64LE(0x1234abcdn, 0)
  return { materials, getNativeWindowHandle: () => handle, setBackgroundMaterial: material => materials.push(material) }
}

test('the accent sent to Windows asks for acrylic with the night tint', () => {
  const accent = accentOf(NIGHT_TINT)
  assert.equal(accent.length, 16)
  assert.equal(accent.readInt32LE(0), ACCENT_ACRYLIC)
  assert.equal(accent.readInt32LE(4), 2)
  assert.equal(accent.readUInt32LE(8), NIGHT_TINT)
  assert.equal(accent.readInt32LE(12), 0)
  assert.equal(ACCENT_ACRYLIC, 4)
  assert.equal(NIGHT_TINT, 0x66161312)
})

test('the blur is applied to the window handle through the composition attribute', () => {
  const calls = []
  const setAttribute = (hwnd, data) => {
    calls.push({ hwnd, data })
    return true
  }
  const win = windowOf()
  const isApplied = applyBlur(win, () => setAttribute)
  const [call] = calls
  assert.equal(isApplied, true)
  assert.equal(calls.length, 1)
  assert.equal(call.hwnd, 0x1234abcdn)
  assert.equal(call.data.Attribute, WCA_ACCENT_POLICY)
  assert.equal(call.data.SizeOfData, 16)
  assert.equal(call.data.Data.readInt32LE(0), ACCENT_ACRYLIC)
  assert.deepEqual(win.materials, [])
})

test('without koffi the window falls back to the Electron acrylic', () => {
  const win = windowOf()
  const isApplied = applyBlur(win, () => {
    throw new Error('koffi introuvable')
  })
  assert.equal(isApplied, false)
  assert.deepEqual(win.materials, ['acrylic'])
})

test('a refused call also falls back to the Electron acrylic', () => {
  const win = windowOf()
  const isApplied = applyBlur(win, () => () => false)
  assert.equal(isApplied, false)
  assert.deepEqual(win.materials, ['acrylic'])
})
