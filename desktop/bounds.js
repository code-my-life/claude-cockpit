const MARGIN = 12
const SHEET_MAX_WIDTH = 1100
const SHEET_MAX_HEIGHT = 800

const boundsOf = (target, area, { isExpanded, dockWidth, dockHeight, sheetWidth, sheetHeight }) => {
  const maxWidth = area.width - 2 * MARGIN
  const maxHeight = area.height - 2 * MARGIN
  const panelWidth = Math.max(dockWidth, Math.min(sheetWidth, SHEET_MAX_WIDTH))
  const panelHeight = Math.min(sheetHeight, SHEET_MAX_HEIGHT) + dockHeight
  const width = Math.min(isExpanded ? panelWidth : dockWidth, maxWidth)
  const height = Math.min(isExpanded ? panelHeight : dockHeight, maxHeight)
  const x = Math.max(area.x, target.right - width)
  const y = Math.max(area.y, target.bottom - height)
  return { x, y, width, height }
}

module.exports = { boundsOf, MARGIN, SHEET_MAX_WIDTH, SHEET_MAX_HEIGHT }
