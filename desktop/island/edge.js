// Détection du bord haut de l'écran par sondage du curseur. L'île cachée n'a
// aucune fenêtre : c'est le processus principal qui regarde où est le curseur,
// et seulement tant que l'île est cachée.
const EDGE_WIDTH = 320
const EDGE_HEIGHT = 4
const POLL_INTERVAL_MS = 100

// Zone de détection : EDGE_WIDTH x EDGE_HEIGHT en haut au centre de la zone utile.
const edgeZoneOf = area => ({
  x: area.x + Math.round((area.width - EDGE_WIDTH) / 2),
  y: area.y,
  width: EDGE_WIDTH,
  height: EDGE_HEIGHT,
})

const isAtEdge = (cursor, area) => {
  const zone = edgeZoneOf(area)
  return cursor.x >= zone.x && cursor.x < zone.x + zone.width && cursor.y >= zone.y && cursor.y < zone.y + zone.height
}

const createEdgePoller = ({ clock, getCursor, getArea, onEdge, intervalMs = POLL_INTERVAL_MS }) => {
  let timer = null
  let wasAtEdge = false

  const tick = () => {
    const isNow = isAtEdge(getCursor(), getArea())
    if (isNow !== wasAtEdge) {
      wasAtEdge = isNow
      onEdge(isNow)
    }
    timer = clock.setTimer(tick, intervalMs)
  }

  return {
    isRunning: () => timer !== null,
    start() {
      if (timer !== null) return
      wasAtEdge = false
      tick()
    },
    stop() {
      if (timer === null) return
      clock.clearTimer(timer)
      timer = null
      wasAtEdge = false
    },
  }
}

module.exports = { edgeZoneOf, isAtEdge, createEdgePoller, EDGE_WIDTH, EDGE_HEIGHT, POLL_INTERVAL_MS }
