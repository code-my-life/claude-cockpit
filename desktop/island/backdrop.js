// Ce qu'il y a derrière l'île : la luminance du bureau juste à côté, pour choisir le thème. Le verre acrylique du système
// prend sa teinte du bureau : sur un bureau clair l'île passe en Papier (encre sombre, teinte claire), sur un bureau sombre
// elle garde Nuit. Module pur : zones, points de lecture et moyenne ; la lecture des pixels est dans pixels.js.
const LIGHT_ABOVE = 0.55
const DARK_BELOW = 0.4
// Zones de mesure, en unités de `unit` pixels d'écran (voir sampleRectsOf).
const SAMPLE_BAND = 16
const SAMPLE_WIDTH = 80
const SAMPLE_GAP = 6

const linear = value => {
  const v = value / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

// Hystérésis : on ne change de thème qu'en franchissant le seuil opposé, pour ne pas clignoter autour du milieu.
const themeOf = (previous, luminance) => {
  if (luminance === null || luminance === undefined) return previous
  if (previous === 'dark') return luminance > LIGHT_ABOVE ? 'light' : 'dark'
  return luminance < DARK_BELOW ? 'dark' : 'light'
}

// Deux zones dans la bande du haut, de part et d'autre de l'île (là où le bureau se voit), en coordonnées de l'écran.
// `unit` : taille d'un pixel de mesure en pixels de l'écran (1 pour des pixels réels, 4 pour la capture réduite d'autrefois).
const sampleRectsOf = (island, screen, unit = 1) => {
  const top = Math.max(screen.y, island.y)
  const height = Math.min(SAMPLE_BAND * unit, screen.y + screen.height - top)
  const width = SAMPLE_WIDTH * unit
  const gap = SAMPLE_GAP * unit
  const left = { x: island.x - gap - width, y: top, width, height }
  const right = { x: island.x + island.width + gap, y: top, width, height }
  return [left, right].filter(rect => rect.x >= screen.x && rect.x + rect.width <= screen.x + screen.width)
}

// Points de lecture au milieu de chaque case d'une grille posée sur chaque zone : on lit quelques pixels de l'écran (GetPixel),
// pas une capture entière (qui bloquait le processus principal 350 ms et gelait la morphose).
const gridPointsOf = (rects, columns, rows) => {
  const points = []
  for (const rect of rects) {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        points.push({ x: Math.round(rect.x + (column + 0.5) * rect.width / columns), y: Math.round(rect.y + (row + 0.5) * rect.height / rows) })
      }
    }
  }
  return points
}

// Luminance moyenne de couleurs [r, g, b] lues sur l'écran (null = lecture ratée, ignorée).
const meanLuminanceOf = colors => {
  const readable = colors.filter(Boolean)
  if (readable.length === 0) return null
  return readable.reduce((total, [r, g, b]) => total + 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b), 0) / readable.length
}

module.exports = { themeOf, sampleRectsOf, gridPointsOf, meanLuminanceOf, LIGHT_ABOVE, DARK_BELOW }
