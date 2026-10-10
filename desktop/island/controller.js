// Pilote l'île : l'automate décide de la phase, le contrôleur en déduit la
// fenêtre (position, taille, clics traversants) et prévient la page.
// Aucune dépendance à Electron : tout passe par les fonctions injectées.
const { createIslandFsm, HIDDEN } = require('./fsm')
const { islandBoundsOf, shapeRectsOf, settleDelayOf } = require('../bounds')

const DEFAULT_DOCK = { width: 120, height: 96 }

const realClock = {
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: handle => clearTimeout(handle),
}

const createIslandController = ({ getArea, applyBounds, applyShape, send, clock = realClock }) => {
  let sizes = { dockWidth: DEFAULT_DOCK.width, dockHeight: DEFAULT_DOCK.height, sheetWidth: 0, sheetHeight: 0 }
  let appliedPhase = HIDDEN
  let hasReducedMotion = false
  let isOffline = false
  let settleTimer = null

  const cancelSettle = () => {
    if (settleTimer === null) return
    clock.clearTimer(settleTimer)
    settleTimer = null
  }

  const place = phase => {
    appliedPhase = phase
    const bounds = islandBoundsOf(getArea(), { ...sizes, phase })
    applyBounds(bounds)
    applyShape(shapeRectsOf(bounds, { ...sizes, phase }))
  }

  const onChange = (to, from) => {
    cancelSettle()
    const delay = settleDelayOf({ from, to, hasReducedMotion })
    if (delay === 0) place(to)
    else settleTimer = clock.setTimer(() => { settleTimer = null; place(fsm.state()) }, delay)
    send('island-state', to)
  }

  const fsm = createIslandFsm({ clock, onChange })

  const resize = () => {
    if (appliedPhase !== HIDDEN) place(appliedPhase)
  }

  return {
    phase: () => fsm.state(),
    start() { fsm.reveal() },
    event() { fsm.reveal() },
    activity() { fsm.activity() },
    escape() { fsm.escape() },
    setPinned(isPinned) { fsm.setPinned(isPinned === true || isOffline) },
    setMotion(isReduced) { hasReducedMotion = isReduced === true },
    pointer(isInside) { fsm.hover(isInside === true) },
    setDockSize(width, height) {
      sizes = { ...sizes, dockWidth: width, dockHeight: height }
      resize()
    },
    setExpanded(isOpen, width, height) {
      // À la fermeture on garde la taille de la fiche : la fenêtre ne rétrécit qu'une fois l'animation finie.
      if (isOpen) sizes = { ...sizes, sheetWidth: width, sheetHeight: height }
      if (isOpen) fsm.open()
      else fsm.fold()
      resize()
    },
    setOffline(isDown, width, height) {
      isOffline = isDown === true
      if (isOffline) sizes = { ...sizes, dockWidth: width, dockHeight: height, sheetWidth: 0, sheetHeight: 0 }
      fsm.setPinned(isOffline)
      resize()
    },
    dispose() {
      cancelSettle()
      fsm.dispose()
    },
  }
}

module.exports = { createIslandController }
