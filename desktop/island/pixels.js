// Lecture de quelques pixels de l'écran (GDI GetPixel), pour mesurer le bureau derrière l'île sans capture d'écran :
// une capture entière bloquait le processus principal environ 350 ms, assez pour geler la morphose de la fenêtre.
// Windows seulement ; sans koffi ou hors Windows, la lecture rend des trous (null) et le thème reste celui d'avant.
const COLOR_FAILED = 0xffffffff

// Chargées une seule fois : redéclarer les fonctions à chaque mesure coûtait des centaines de millisecondes dans Electron.
let gdiCache = null
const loadGdi = () => {
  if (gdiCache === null) gdiCache = declareGdi()
  return gdiCache
}

const declareGdi = () => {
  const koffi = require('koffi')
  const user32 = koffi.load('user32.dll')
  const gdi32 = koffi.load('gdi32.dll')
  return {
    getDc: user32.func('void * __stdcall GetDC(void *hwnd)'),
    releaseDc: user32.func('int __stdcall ReleaseDC(void *hwnd, void *hdc)'),
    getPixel: gdi32.func('uint32 __stdcall GetPixel(void *hdc, int x, int y)'),
  }
}

// COLORREF = 0x00BBGGRR
const colorOf = value => (value === COLOR_FAILED ? null : [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff])

const readPixels = (points, platform = process.platform, load = loadGdi) => {
  if (platform !== 'win32') return points.map(() => null)
  let gdi
  try {
    gdi = load()
  } catch {
    return points.map(() => null)
  }
  const hdc = gdi.getDc(null)
  if (!hdc) return points.map(() => null)
  try {
    return points.map(point => colorOf(gdi.getPixel(hdc, point.x, point.y)))
  } finally {
    gdi.releaseDc(null, hdc)
  }
}

module.exports = { readPixels, colorOf }
