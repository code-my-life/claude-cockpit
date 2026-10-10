// The tray icon and menu, kept free of Electron so they can be tested. The
// icon is an ink ring drawn in code: light ink with a dark rim, readable on a
// light or a dark taskbar.
const TRAY_ICON_SIZE = 32
const OUTER_RADIUS = 14.5
const INNER_RADIUS = 7
const RIM_WIDTH = 1.5
const INK = [0xec, 0xec, 0xe6]
const RIM = [0x17, 0x18, 0x1b]
const BYTES_PER_PIXEL = 4
const OPAQUE = 255

// How much of a pixel at `distance` from the centre falls inside `radius`.
const coverage = (distance, radius) => Math.min(1, Math.max(0, radius - distance))

const colourAt = distance => {
  const isOnRim = OUTER_RADIUS - distance < RIM_WIDTH || distance - INNER_RADIUS < RIM_WIDTH
  return isOnRim ? RIM : INK
}

// Raw BGRA pixels, the layout nativeImage.createFromBitmap expects on Windows.
const trayIconBitmap = (size = TRAY_ICON_SIZE) => {
  const bitmap = Buffer.alloc(size * size * BYTES_PER_PIXEL)
  const centre = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - centre, y + 0.5 - centre)
      const alpha = coverage(distance, OUTER_RADIUS) * (1 - coverage(distance, INNER_RADIUS))
      const [red, green, blue] = colourAt(distance)
      const offset = (y * size + x) * BYTES_PER_PIXEL
      bitmap[offset] = blue
      bitmap[offset + 1] = green
      bitmap[offset + 2] = red
      bitmap[offset + 3] = Math.round(alpha * OPAQUE)
    }
  }
  return bitmap
}

const trayMenuOf = ({ isDockVisible, isAutostart, canOpenInBrowser = false }) => [
  { id: 'open-cockpit', label: 'Ouvrir le cockpit' },
  ...(canOpenInBrowser ? [{ id: 'open-browser', label: 'Ouvrir dans le navigateur' }] : []),
  { id: 'toggle-dock', label: isDockVisible ? 'Masquer la mini-équipe' : 'Afficher la mini-équipe' },
  { id: 'autostart', label: 'Lancer au démarrage', type: 'checkbox', checked: isAutostart },
  { type: 'separator' },
  { id: 'quit', label: 'Quitter' },
]

module.exports = { trayIconBitmap, trayMenuOf, TRAY_ICON_SIZE }
