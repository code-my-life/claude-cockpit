const ACCENT_ACRYLIC = 4
const ACCENT_FLAGS = 2
const ACCENT_SIZE = 16
const WCA_ACCENT_POLICY = 19
const NIGHT_TINT = 0x66161312
const FALLBACK_MATERIAL = 'acrylic'

const accentOf = tint => {
  const accent = Buffer.alloc(ACCENT_SIZE)
  accent.writeInt32LE(ACCENT_ACRYLIC, 0)
  accent.writeInt32LE(ACCENT_FLAGS, 4)
  accent.writeUInt32LE(tint, 8)
  accent.writeInt32LE(0, 12)
  return accent
}

let compositionSetter = null

const loadCompositionSetter = () => {
  if (compositionSetter !== null) return compositionSetter
  const koffi = require('koffi')
  const user32 = koffi.load('user32.dll')
  koffi.struct('WCA_DATA', { Attribute: 'int', Data: 'void *', SizeOfData: 'size_t' })
  compositionSetter = user32.func('bool __stdcall SetWindowCompositionAttribute(uintptr_t hwnd, WCA_DATA *data)')
  return compositionSetter
}

const tryAccent = (win, loadSetter) => {
  try {
    const setAttribute = loadSetter()
    const handle = win.getNativeWindowHandle()
    const hwnd = handle.readBigUInt64LE(0)
    const accent = accentOf(NIGHT_TINT)
    return setAttribute(hwnd, { Attribute: WCA_ACCENT_POLICY, Data: accent, SizeOfData: ACCENT_SIZE }) === true
  } catch {
    return false
  }
}

const applyBlur = (win, loadSetter = loadCompositionSetter) => {
  const isApplied = tryAccent(win, loadSetter)
  if (!isApplied) win.setBackgroundMaterial(FALLBACK_MATERIAL)
  return isApplied
}

module.exports = { accentOf, applyBlur, ACCENT_ACRYLIC, WCA_ACCENT_POLICY, NIGHT_TINT }
