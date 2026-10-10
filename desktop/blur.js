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

const MAC_VIBRANCY = 'under-window'

const applyWindowsBlur = (win, loadSetter) => {
  if (tryAccent(win, loadSetter)) return true
  if (typeof win.setBackgroundMaterial !== 'function') return false
  win.setBackgroundMaterial(FALLBACK_MATERIAL)
  return true
}

const applyMacBlur = win => {
  if (typeof win.setVibrancy !== 'function') return false
  win.setVibrancy(MAC_VIBRANCY)
  return true
}

// Returns true when the operating system blurs what is behind the window.
// Linux has no native blur: the page then draws its own CSS glass.
const applyBlur = (win, loadSetter = loadCompositionSetter, platform = process.platform) => {
  if (platform === 'win32') return applyWindowsBlur(win, loadSetter)
  if (platform === 'darwin') return applyMacBlur(win)
  return false
}

module.exports = { accentOf, applyBlur, ACCENT_ACRYLIC, WCA_ACCENT_POLICY, NIGHT_TINT }
