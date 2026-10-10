// Géométrie pure de l'île : fenêtre en haut au centre de l'écran principal.
// Caché : une bande d'éveil. Réduit : le dock. Ouvert : le dock et la fiche dessous.
const ISLAND_PAD = 16
const SCREEN_MARGIN = 12
const WAKE_WIDTH = 320
// Windows impose une hauteur minimale d'environ 39 px à la fenêtre : la bande d'éveil
// visible de la page ne fait que WAKE_HEIGHT, le reste de la fenêtre laisse passer les clics.
const WAKE_HEIGHT = 8
const SHEET_MAX_WIDTH = 1100
const SHEET_MAX_HEIGHT = 800
const FALLBACK_DOCK = { width: 120, height: 96 }
// Mêmes durées que --island-open et --island-close dans conversations.html.
const ISLAND_OPEN_MS = 280
const ISLAND_CLOSE_MS = 180
const SETTLE_SLACK_MS = 40

const RANKS = { hidden: 0, compact: 1, open: 2 }

const positive = (value, fallback) => (Number.isFinite(value) && value > 0 ? Math.round(value) : fallback)

const sizeOf = (phase, { dockWidth, dockHeight, sheetWidth, sheetHeight }) => {
  if (phase === 'hidden') return { width: WAKE_WIDTH, height: WAKE_HEIGHT }
  const dock = { width: positive(dockWidth, FALLBACK_DOCK.width), height: positive(dockHeight, FALLBACK_DOCK.height) }
  if (phase === 'compact') return { width: dock.width + 2 * ISLAND_PAD, height: dock.height + 2 * ISLAND_PAD }
  const sheet = { width: Math.min(positive(sheetWidth, 0), SHEET_MAX_WIDTH), height: Math.min(positive(sheetHeight, 0), SHEET_MAX_HEIGHT) }
  return { width: Math.max(dock.width, sheet.width) + 2 * ISLAND_PAD, height: dock.height + sheet.height + 3 * ISLAND_PAD }
}

const islandBoundsOf = (area, sizes) => {
  const wanted = sizeOf(sizes.phase, sizes)
  const width = Math.min(wanted.width, area.width - 2 * SCREEN_MARGIN)
  const height = Math.min(wanted.height, area.height - SCREEN_MARGIN)
  const x = area.x + Math.round((area.width - width) / 2)
  return { x, y: area.y, width, height }
}

// Zones qui captent la souris, relatives à la fenêtre : le reste est transparent
// et laisse passer les clics (setShape). Même disposition que le CSS de la page :
// marge, dock centré, marge, fiche sur toute la largeur utile.
const shapeRectsOf = (bounds, { phase, dockWidth, dockHeight, sheetHeight }) => {
  if (phase === 'hidden') return [{ x: Math.round((bounds.width - WAKE_WIDTH) / 2), y: 0, width: Math.min(WAKE_WIDTH, bounds.width), height: WAKE_HEIGHT }]
  const dockW = Math.min(positive(dockWidth, FALLBACK_DOCK.width), bounds.width - 2 * ISLAND_PAD)
  const dockH = positive(dockHeight, FALLBACK_DOCK.height)
  const dock = { x: Math.round((bounds.width - dockW) / 2), y: ISLAND_PAD, width: dockW, height: dockH }
  if (phase === 'compact') return [dock]
  const top = ISLAND_PAD + dockH + ISLAND_PAD
  const height = Math.max(0, Math.min(positive(sheetHeight, 0), SHEET_MAX_HEIGHT, bounds.height - top - ISLAND_PAD))
  return [dock, { x: ISLAND_PAD, y: top, width: bounds.width - 2 * ISLAND_PAD, height }]
}

// Une fenêtre qui grandit s'applique tout de suite ; une fenêtre qui rétrécit
// attend la fin de l'animation de repli, sauf si les animations sont coupées.
const settleDelayOf = ({ from, to, hasReducedMotion }) => {
  const isShrinking = RANKS[to] < RANKS[from]
  return isShrinking && !hasReducedMotion ? ISLAND_CLOSE_MS + SETTLE_SLACK_MS : 0
}

module.exports = { islandBoundsOf, shapeRectsOf, settleDelayOf, ISLAND_PAD, SCREEN_MARGIN, WAKE_WIDTH, WAKE_HEIGHT, SHEET_MAX_WIDTH, SHEET_MAX_HEIGHT, ISLAND_OPEN_MS, ISLAND_CLOSE_MS, SETTLE_SLACK_MS }
