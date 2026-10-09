const { test } = require('node:test')
const assert = require('node:assert/strict')
const { boundsOf, MARGIN, SHEET_MAX_WIDTH } = require('./bounds')

const AREA = { x: 0, y: 0, width: 1920, height: 1040 }
const ANCHOR = { right: 1908, bottom: 1028 }
const DOCK = { dockWidth: 420, dockHeight: 96 }

test('dock replie : la fenetre a exactement la taille du dock, calee en bas a droite', () => {
  const bounds = boundsOf(ANCHOR, AREA, { ...DOCK, isExpanded: false, sheetWidth: 900, sheetHeight: 600 })
  assert.deepEqual(bounds, { x: 1488, y: 932, width: 420, height: 96 })
})

test('fiche ouverte : largeur de la fiche, hauteur fiche plus dock', () => {
  const bounds = boundsOf(ANCHOR, AREA, { ...DOCK, isExpanded: true, sheetWidth: 900, sheetHeight: 600 })
  assert.deepEqual(bounds, { x: 1008, y: 332, width: 900, height: 696 })
})

test('fiche plus etroite que le dock : le panneau prend la largeur du dock', () => {
  const bounds = boundsOf(ANCHOR, AREA, { ...DOCK, isExpanded: true, sheetWidth: 380, sheetHeight: 300 })
  assert.equal(bounds.width, 420)
})

test('fiche trop large : la largeur est plafonnee', () => {
  const bounds = boundsOf(ANCHOR, AREA, { ...DOCK, isExpanded: true, sheetWidth: 3000, sheetHeight: 300 })
  assert.equal(bounds.width, SHEET_MAX_WIDTH)
})

test('petit ecran : le panneau reste dans la zone utile', () => {
  const smallArea = { x: 0, y: 0, width: 800, height: 500 }
  const smallAnchor = { right: 788, bottom: 488 }
  const bounds = boundsOf(smallAnchor, smallArea, { ...DOCK, isExpanded: true, sheetWidth: 1000, sheetHeight: 800 })
  const maxWidth = smallArea.width - 2 * MARGIN
  const maxHeight = smallArea.height - 2 * MARGIN
  assert.equal(bounds.width, maxWidth)
  assert.equal(bounds.height, maxHeight)
})

test('ancre pres du bord gauche et du haut : la fenetre ne sort pas de l ecran', () => {
  const area = { x: -1920, y: 0, width: 1920, height: 1040 }
  const nearCorner = { right: -1800, bottom: 60 }
  const bounds = boundsOf(nearCorner, area, { ...DOCK, isExpanded: true, sheetWidth: 900, sheetHeight: 600 })
  assert.equal(bounds.x, area.x)
  assert.equal(bounds.y, area.y)
})
