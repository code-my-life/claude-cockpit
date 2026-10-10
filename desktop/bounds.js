// Géométrie pure de l'île : la fenêtre EST la forme, collée au bord haut au centre de l'écran principal.
// Le verre est celui du système (acrylique de Windows) : il remplit toute la fenêtre et ignore setShape
// (vérifié), donc la fenêtre épouse exactement la pastille réduite ou l'île ouverte (plus les toasts dessous)
// et c'est elle qui s'anime pendant la morphose (morph.js), en ressort : 300 ms à l'ouverture, 260 ms au repli.
const SCREEN_MARGIN = 12
const TOAST_GAP = 8
const FALLBACK_COMPACT = { width: 320, height: 44 }
const FALLBACK_OPEN = { width: 760, height: 280 }
const OPEN_SPRING = { ms: 300, zeta: 0.72 }
const CLOSE_SPRING = { ms: 260, zeta: 0.9 }

const positive = (value, fallback) => (Number.isFinite(value) && value > 0 ? Math.round(value) : fallback)

const targetOf = ({ phase, compactWidth, compactHeight, openWidth, openHeight }) => (phase === 'compact'
  ? { width: positive(compactWidth, FALLBACK_COMPACT.width), height: positive(compactHeight, FALLBACK_COMPACT.height) }
  : { width: positive(openWidth, FALLBACK_OPEN.width), height: positive(openHeight, FALLBACK_OPEN.height) })

const toastsOf = ({ toastWidth = 0, toastHeight = 0 }) => (toastHeight > 0 ? { width: positive(toastWidth, 0), height: Math.round(toastHeight) } : null)

const islandBoundsOf = (area, sizes) => {
  const island = targetOf(sizes)
  const toasts = toastsOf(sizes)
  const wanted = {
    width: Math.max(island.width, toasts ? toasts.width + 2 * TOAST_GAP : 0),
    height: island.height + (toasts ? TOAST_GAP + toasts.height : 0),
  }
  const width = Math.min(wanted.width, area.width - 2 * SCREEN_MARGIN)
  const height = Math.min(wanted.height, area.height)
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y, width, height }
}

// Rétractée dans le bord : même largeur, hauteur d'un pixel (une fenêtre ne peut pas être vide).
const collapsedBoundsOf = bounds => ({ ...bounds, height: 1 })

module.exports = { islandBoundsOf, collapsedBoundsOf, SCREEN_MARGIN, TOAST_GAP, OPEN_SPRING, CLOSE_SPRING }
