// Pilote l'île : l'automate décide de la phase, le contrôleur en déduit la
// fenêtre (position, taille, clics traversants) et prévient la page.
// Aucune dépendance à Electron : tout passe par les fonctions injectées.
const { createIslandFsm, HIDDEN } = require('./fsm')
const { islandBoundsOf, shapeRectsOf, settleDelayOf } = require('../bounds')
const { createEdgePoller } = require('./edge')

const DEFAULT_DOCK = { width: 120, height: 96 }

const realClock = {
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: handle => clearTimeout(handle),
}

const createIslandController = ({ getArea, getCursor, applyBounds, applyShape, setVisible, focusWindow = () => {}, send, clock = realClock }) => {
  let sizes = { dockWidth: DEFAULT_DOCK.width, dockHeight: DEFAULT_DOCK.height, sheetWidth: 0, sheetHeight: 0 }
  let appliedPhase = HIDDEN
  let hasReducedMotion = false
  let isOffline = false
  let pageKind = 'none'
  let settleTimer = null

  const cancelSettle = () => {
    if (settleTimer === null) return
    clock.clearTimer(settleTimer)
    settleTimer = null
  }

  const place = phase => {
    appliedPhase = phase
    if (phase === HIDDEN) {
      // Caché : plus aucune fenêtre, donc plus aucun pixel qui capte la souris.
      setVisible(false)
      return
    }
    const bounds = islandBoundsOf(getArea(), { ...sizes, phase })
    applyBounds(bounds)
    applyShape(shapeRectsOf(bounds, { ...sizes, phase }))
    setVisible(true)
  }

  // Le curseur n'est sondé que tant que l'île est cachée.
  const edgePoller = createEdgePoller({ clock, getCursor, getArea, onEdge: isAtEdge => fsm.edge(isAtEdge) })

  const settleNow = () => {
    cancelSettle()
    place(fsm.state())
  }

  const onChange = (to, from, cause) => {
    cancelSettle()
    if (to === HIDDEN) edgePoller.start()
    else edgePoller.stop()
    const delay = settleDelayOf({ from, to, hasReducedMotion })
    if (delay === 0) place(to)
    else settleTimer = clock.setTimer(() => { settleTimer = null; place(fsm.state()) }, delay)
    send('island-state', to, cause)
  }

  const fsm = createIslandFsm({ clock, onChange })

  const resize = () => {
    if (appliedPhase !== HIDDEN) place(appliedPhase)
  }

  return {
    phase: () => fsm.state(),
    start() { fsm.reveal() },
    event() { fsm.reveal() },
    // Accès clavier : révèle l'île, la montre tout de suite et donne le focus au dock.
    showAndFocus() {
      fsm.reveal()
      settleNow()
      focusWindow()
      send('island-focus')
    },
    activity() { fsm.activity() },
    escape() { fsm.escape() },
    setPinned(kind) {
      pageKind = kind
      fsm.setPinned(isOffline ? 'attention' : kind)
    },
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
      // La page a déjà fermé sa fiche : inutile d'attendre la fin de l'animation.
      if (isOpen) resize()
      else settleNow()
    },
    setOffline(isDown, width, height) {
      isOffline = isDown === true
      if (isOffline) sizes = { ...sizes, dockWidth: width, dockHeight: height, sheetWidth: 0, sheetHeight: 0 }
      fsm.setPinned(isOffline ? 'attention' : pageKind)
      resize()
    },
    dispose() {
      cancelSettle()
      edgePoller.stop()
      fsm.dispose()
    },
  }
}

module.exports = { createIslandController }
