// Géométrie pure de l'île : une scène fixe en haut au centre de l'écran principal.
// Caché : aucune fenêtre. Visible : la fenêtre garde toujours la taille de la scène (aucun
// redimensionnement pendant la morphose, donc aucune saccade) et seule la forme cliquable
// (setShape) épouse l'île : la pastille réduite, l'île ouverte, les toasts dessous.
const STAGE_WIDTH = 800
const STAGE_HEIGHT = 640
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

const islandBoundsOf = area => {
  const width = Math.min(STAGE_WIDTH, area.width - 2 * SCREEN_MARGIN)
  const height = Math.min(STAGE_HEIGHT, area.height)
  const x = area.x + Math.round((area.width - width) / 2)
  return { x, y: area.y, width, height }
}

// Zones qui captent la souris, relatives à la fenêtre : le reste est transparent et laisse passer les clics.
const shapeRectsOf = (bounds, { phase, dockWidth, dockHeight, sheetWidth, sheetHeight, toastWidth = 0, toastHeight = 0 }) => {
  if (phase === 'hidden') return []
  const target = phase === 'compact'
    ? { width: positive(dockWidth, FALLBACK_COMPACT.width), height: positive(dockHeight, FALLBACK_COMPACT.height) }
    : { width: positive(sheetWidth, FALLBACK_OPEN.width), height: positive(sheetHeight, FALLBACK_OPEN.height) }
  const width = Math.min(target.width + 2 * SHAPE_PAD, bounds.width)
  const height = Math.min(target.height + SHAPE_PAD, bounds.height)
  const island = { x: Math.round((bounds.width - width) / 2), y: 0, width, height }
  if (!(toastHeight > 0)) return [island]
  const toastsWidth = Math.min(positive(toastWidth, 0), bounds.width - TOAST_GAP)
  const toastsHeight = Math.min(TOAST_GAP + Math.round(toastHeight) + SHAPE_PAD, Math.max(0, bounds.height - height))
  return [island, { x: Math.max(0, bounds.width - TOAST_GAP - toastsWidth), y: height, width: toastsWidth, height: toastsHeight }]
}

// Une forme qui grandit s'applique tout de suite ; une forme qui rétrécit
// attend la fin de l'animation de repli, sauf si les animations sont coupées.
const settleDelayOf = ({ from, to, hasReducedMotion }) => {
  const isShrinking = RANKS[to] < RANKS[from]
  return isShrinking && !hasReducedMotion ? ISLAND_CLOSE_MS + SETTLE_SLACK_MS : 0
}

module.exports = { islandBoundsOf, shapeRectsOf, settleDelayOf, STAGE_WIDTH, STAGE_HEIGHT, SCREEN_MARGIN, SHAPE_PAD, TOAST_GAP, ISLAND_OPEN_MS, ISLAND_CLOSE_MS, SETTLE_SLACK_MS }
