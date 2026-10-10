// Ce qu'il y a derrière l'île : la luminance du bureau juste à côté, pour choisir le thème. Le verre acrylique du système
// prend sa teinte du bureau : sur un bureau clair l'île passe en Papier (encre sombre, teinte claire), sur un bureau sombre
// elle garde Nuit. Module pur : l'image est un tampon BGRA (celui d'une capture d'écran Electron), rien d'autre.
const LIGHT_ABOVE = 0.55
const DARK_BELOW = 0.4
// Mesures en pixels de la capture réduite (1 pixel = 4 pixels d'écran).
const SAMPLE_BAND = 16
const SAMPLE_WIDTH = 80
const SAMPLE_GAP = 6

const linear = value => {
  const v = value / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

const asList = rects => (Array.isArray(rects) ? rects : [rects])

// Luminance relative moyenne (0 noir, 1 blanc) des zones données, ou null s'il n'y a rien à mesurer.
const luminanceOf = ({ data, width, height }, rects) => {
  let total = 0
  let count = 0
  for (const rect of asList(rects)) {
    const x1 = Math.min(width, rect.x + rect.width)
    const y1 = Math.min(height, rect.y + rect.height)
    for (let y = Math.max(0, rect.y); y < y1; y++) {
      for (let x = Math.max(0, rect.x); x < x1; x++) {
        const at = (y * width + x) * 4
        total += 0.2126 * linear(data[at + 2]) + 0.7152 * linear(data[at + 1]) + 0.0722 * linear(data[at])
        count += 1
      }
    }
  }
  return count === 0 ? null : total / count
}

// Hystérésis : on ne change de thème qu'en franchissant le seuil opposé, pour ne pas clignoter autour du milieu.
const themeOf = (previous, luminance) => {
  if (luminance === null || luminance === undefined) return previous
  if (previous === 'dark') return luminance > LIGHT_ABOVE ? 'light' : 'dark'
  return luminance < DARK_BELOW ? 'dark' : 'light'
}

// Deux zones dans la bande du haut, de part et d'autre de l'île (là où le bureau se voit), en coordonnées de l'écran.
const sampleRectsOf = (island, screen) => {
  const top = Math.max(screen.y, island.y)
  const height = Math.min(SAMPLE_BAND, screen.y + screen.height - top)
  const left = { x: island.x - SAMPLE_GAP - SAMPLE_WIDTH, y: top, width: SAMPLE_WIDTH, height }
  const right = { x: island.x + island.width + SAMPLE_GAP, y: top, width: SAMPLE_WIDTH, height }
  return [left, right].filter(rect => rect.x >= screen.x && rect.x + rect.width <= screen.x + screen.width)
}

module.exports = { luminanceOf, themeOf, sampleRectsOf, LIGHT_ABOVE, DARK_BELOW }
