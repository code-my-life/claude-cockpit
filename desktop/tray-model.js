// The tray icon and menu, kept free of Electron so they can be tested. The
// icon is an ink ring drawn in code: light ink with a dark rim, readable on a
// light or a dark taskbar.
const TRAY_ICON_SIZE = 32
// Proportions of the ring, drawn the same at any size (tray, app icon).
const OUTER_RATIO = 14.5 / 32
const INNER_RATIO = 7 / 32
const RIM_RATIO = 1.5 / 32
const INK = [0xec, 0xec, 0xe6]
const RIM = [0x17, 0x18, 0x1b]
const BYTES_PER_PIXEL = 4
const OPAQUE = 255

// How much of a pixel at `distance` from the centre falls inside `radius`.
const coverage = (distance, radius) => Math.min(1, Math.max(0, radius - distance))

const colourAt = (distance, outer, inner, rim) => {
  const isOnRim = outer - distance < rim || distance - inner < rim
  return isOnRim ? RIM : INK
}

// Raw BGRA pixels, the layout nativeImage.createFromBitmap expects on Windows.
const trayIconBitmap = (size = TRAY_ICON_SIZE) => {
  const bitmap = Buffer.alloc(size * size * BYTES_PER_PIXEL)
  const centre = size / 2
  const [outer, inner, rim] = [OUTER_RATIO * size, INNER_RATIO * size, RIM_RATIO * size]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - centre, y + 0.5 - centre)
      const alpha = coverage(distance, outer) * (1 - coverage(distance, inner))
      const [red, green, blue] = colourAt(distance, outer, inner, rim)
      const offset = (y * size + x) * BYTES_PER_PIXEL
      bitmap[offset] = blue
      bitmap[offset + 1] = green
      bitmap[offset + 2] = red
      bitmap[offset + 3] = Math.round(alpha * OPAQUE)
    }
  }
  return bitmap
}

const trayMenuOf = ({ isDockVisible, isAutostart, areSoundsOn = true, canOpenInBrowser = false, canInstallMod = false }) => [
  { id: 'open-cockpit', label: 'Ouvrir le cockpit' },
  ...(canOpenInBrowser ? [{ id: 'open-browser', label: 'Ouvrir dans le navigateur' }] : []),
  ...(canInstallMod ? [{ id: 'install-mod', label: 'Installer le mod dans Claude' }] : []),
  { id: 'show-island', label: "Afficher l'île" },
  { id: 'toggle-dock', label: isDockVisible ? 'Masquer la mini-équipe' : 'Afficher la mini-équipe' },
  { id: 'autostart', label: 'Lancer au démarrage', type: 'checkbox', checked: isAutostart },
  { id: 'toggle-sounds', label: areSoundsOn ? 'Couper les sons' : 'Activer les sons' },
  { type: 'separator' },
  { id: 'quit', label: 'Quitter' },
]

module.exports = { trayIconBitmap, trayMenuOf, TRAY_ICON_SIZE }
