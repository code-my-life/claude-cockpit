// Géométrie pure de l'île : la fenêtre épouse l'île, collée au bord haut au centre de l'écran principal.
// Caché : aucune fenêtre. Visible : la fenêtre a la taille de la forme cible (pastille réduite ou île ouverte,
// plus les toasts dessous). Elle change de taille par paliers, jamais image par image : elle grandit d'un coup
// au début de l'ouverture, elle rétrécit d'un coup quand la fermeture est finie. Pendant la morphose seule la page
// dessine (la fenêtre est déjà à la taille cible), et la forme cliquable (setShape) épouse l'île et les toasts.
// Une fenêtre transparente se recompose en entier à chaque image animée : la garder petite quand l'île est réduite
// coûte moins de GPU qu'une fenêtre fixe à la taille ouverte (mesuré, voir le README).
const SCREEN_MARGIN = 12
// Marge autour de la forme : le bord du verre et son ombre ne sont pas rognés.
const SHAPE_PAD = 8
const TOAST_GAP = 8
const FALLBACK_COMPACT = { width: 320, height: 44 }
const FALLBACK_OPEN = { width: 760, height: 280 }
// Mêmes durées que le mouvement de l'île de la page (ressort de 300 ms à l'ouverture, 260 ms au repli).
const ISLAND_OPEN_MS = 300
const ISLAND_CLOSE_MS = 260
const SETTLE_SLACK_MS = 40

const RANKS = { hidden: 0, compact: 1, open: 2 }

const positive = (value, fallback) => (Number.isFinite(value) && value > 0 ? Math.round(value) : fallback)

const targetOf = ({ phase, dockWidth, dockHeight, sheetWidth, sheetHeight }) => (phase === 'compact'
  ? { width: positive(dockWidth, FALLBACK_COMPACT.width), height: positive(dockHeight, FALLBACK_COMPACT.height) }
  : { width: positive(sheetWidth, FALLBACK_OPEN.width), height: positive(sheetHeight, FALLBACK_OPEN.height) })

const toastsOf = ({ toastWidth = 0, toastHeight = 0 }) => (toastHeight > 0 ? { width: positive(toastWidth, 0), height: Math.round(toastHeight) } : null)

const islandBoundsOf = (area, sizes) => {
  const island = targetOf(sizes)
  const toasts = toastsOf(sizes)
  const wanted = {
    width: Math.max(island.width + 2 * SHAPE_PAD, toasts ? toasts.width + 2 * TOAST_GAP : 0),
    height: island.height + SHAPE_PAD + (toasts ? TOAST_GAP + toasts.height + SHAPE_PAD : 0),
  }
  const width = Math.min(wanted.width, area.width - 2 * SCREEN_MARGIN)
  const height = Math.min(wanted.height, area.height)
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y, width, height }
}

// Zones qui captent la souris, relatives à la fenêtre : le reste est transparent et laisse passer les clics.
const shapeRectsOf = (bounds, sizes) => {
  if (sizes.phase === 'hidden') return []
  const island = targetOf(sizes)
  const width = Math.min(island.width + 2 * SHAPE_PAD, bounds.width)
  const height = Math.min(island.height + SHAPE_PAD, bounds.height)
  const shape = { x: Math.round((bounds.width - width) / 2), y: 0, width, height }
  const toasts = toastsOf(sizes)
  if (toasts === null) return [shape]
  const toastsWidth = Math.min(toasts.width, bounds.width - TOAST_GAP)
  const toastsHeight = Math.min(TOAST_GAP + toasts.height + SHAPE_PAD, Math.max(0, bounds.height - height))
  return [shape, { x: Math.max(0, bounds.width - TOAST_GAP - toastsWidth), y: height, width: toastsWidth, height: toastsHeight }]
}

// Une forme qui grandit s'applique tout de suite ; une forme qui rétrécit
// attend la fin de l'animation de repli, sauf si les animations sont coupées.
const settleDelayOf = ({ from, to, hasReducedMotion }) => {
  const isShrinking = RANKS[to] < RANKS[from]
  return isShrinking && !hasReducedMotion ? ISLAND_CLOSE_MS + SETTLE_SLACK_MS : 0
}

module.exports = { islandBoundsOf, shapeRectsOf, settleDelayOf, SCREEN_MARGIN, SHAPE_PAD, TOAST_GAP, ISLAND_OPEN_MS, ISLAND_CLOSE_MS, SETTLE_SLACK_MS }
