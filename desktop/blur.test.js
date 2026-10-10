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
  const isApplied = applyBlur(win, () => setAttribute, 'win32')
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
  const hasBlur = applyBlur(win, () => {
    throw new Error('koffi introuvable')
  }, 'win32')
  assert.equal(hasBlur, true)
  assert.deepEqual(win.materials, ['acrylic'])
})

test('a refused call also falls back to the Electron acrylic', () => {
  const win = windowOf()
  const hasBlur = applyBlur(win, () => () => false, 'win32')
  assert.equal(hasBlur, true)
  assert.deepEqual(win.materials, ['acrylic'])
})

test('on Windows 10 without any material API there is no blur and no crash', () => {
  const win = { getNativeWindowHandle: () => Buffer.alloc(8) }
  const hasBlur = applyBlur(win, () => () => false, 'win32')
  assert.equal(hasBlur, false)
})

test('on macOS the window gets the vibrancy and never touches Win32', () => {
  const vibrancies = []
  const win = { setVibrancy: name => vibrancies.push(name) }
  const hasBlur = applyBlur(win, () => { throw new Error('ne doit pas être appelé') }, 'darwin')
  assert.equal(hasBlur, true)
  assert.deepEqual(vibrancies, ['under-window'])
})

test('on Linux there is no native blur and nothing crashes', () => {
  const win = {}
  const hasBlur = applyBlur(win, () => { throw new Error('ne doit pas être appelé') }, 'linux')
  assert.equal(hasBlur, false)
})
