const LAUNCHER_WIDTH = 720
const LAUNCHER_MIN_HEIGHT = 64
const LAUNCHER_MARGIN = 24
const LAUNCHER_TOP_RATIO = 0.22

const launcherBoundsOf = (area, height) => {
  const width = Math.min(LAUNCHER_WIDTH, area.width - 2 * LAUNCHER_MARGIN)
  const x = area.x + Math.round((area.width - width) / 2)
  const y = area.y + Math.round(area.height * LAUNCHER_TOP_RATIO)
  const room = area.y + area.height - y
  const rounded = Math.round(height)
  const asked = Math.max(LAUNCHER_MIN_HEIGHT, rounded)
  const fitted = Math.min(asked, room)
  return { x, y, width, height: fitted }
}

module.exports = { launcherBoundsOf, LAUNCHER_WIDTH, LAUNCHER_MIN_HEIGHT }
