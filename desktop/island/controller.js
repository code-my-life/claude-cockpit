// Pilote l'île : l'automate décide de la phase, le contrôleur en déduit la fenêtre
// (position, taille animée) et prévient la page. La fenêtre EST la forme (verre acrylique du système) :
// c'est elle qui s'anime pendant la morphose, en ressort, par le morphe injecté.
// Aucune dépendance à Electron : tout passe par les fonctions injectées.
const { createIslandFsm, HIDDEN } = require('./fsm')
const { islandBoundsOf, OPEN_SPRING, CLOSE_SPRING, collapsedBoundsOf } = require('../bounds')
const { createEdgePoller } = require('./edge')
const { createMorph } = require('./morph')

const DEFAULT_COMPACT = { width: 320, height: 44 }
const FRAME_MS = 8

const realClock = {
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: handle => clearTimeout(handle),
  now: () => Date.now(),
}

const areaOf = bounds => bounds.width * bounds.height

const createIslandController = ({ getArea, getCursor, applyBounds, setVisible, focusWindow = () => {}, isFullscreenActive = () => false, isScreenReaderActive = () => false, send, sendGeometry = () => {}, clock = realClock, schedule = null, motionScale = 1 }) => {
  let sizes = { compactWidth: DEFAULT_COMPACT.width, compactHeight: DEFAULT_COMPACT.height, openWidth: 0, openHeight: 0, toastWidth: 0, toastHeight: 0 }
  let appliedPhase = HIDDEN
  let hasReducedMotion = false
  let isOffline = false
  let pageKind = 'none'
  // Dernier état de survol donné à l'automate (par la page ou par le curseur réel) : on ne le redonne que s'il change.
  let isPointerInside = false
  const setPointer = isInside => {
    isPointerInside = isInside
    fsm.hover(isInside)
  }
  const frame = schedule || (run => clock.setTimer(run, FRAME_MS))
  // Every morph start goes to the page too: the glass window morphs, the page draws the same shape on the same clock.
  const morph = createMorph({ now: () => (clock.now ? clock.now() : Date.now()), schedule: frame, cancel: () => {}, apply: applyBounds, onStart: sendGeometry })

  const spring = isGrowing => {
    const base = isGrowing ? OPEN_SPRING : CLOSE_SPRING
    return { ms: hasReducedMotion ? 0 : base.ms * motionScale, zeta: base.zeta }
  }

  // Le survol rapporté par la page ne vient que de mousemove et mouseleave : une fenêtre qui rétrécit sous un curseur immobile
  // ne reçoit plus rien. On confronte donc le curseur réel aux bornes de la fenêtre en fin de morphose et à chaque changement d'état.
  const syncHover = () => {
    const bounds = morph.boundsOf()
    if (appliedPhase === HIDDEN || bounds === null) return
    const cursor = getCursor()
    const isInside = cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width && cursor.y >= bounds.y && cursor.y < bounds.y + bounds.height
    if (isInside !== isPointerInside) setPointer(isInside)
  }

  // Caché : la forme se rétracte dans le bord puis la fenêtre disparaît (plus aucun pixel ne capte la souris).
  const collapse = () => {
    const bounds = morph.boundsOf()
    if (bounds === null) { setVisible(false); return }
    morph.to(collapsedBoundsOf(bounds), {
      ...spring(false),
      onDone: () => {
        if (appliedPhase !== HIDDEN) return
        setVisible(false)
        morph.reset()
      },
    })
  }

  // La fenêtre arrive à la taille de la forme cible ; cachée, elle sort du bord (hauteur 1 puis cible).
  const place = phase => {
    appliedPhase = phase
    if (phase === HIDDEN) { collapse(); return }
    const target = islandBoundsOf(getArea(), { ...sizes, phase })
    if (morph.boundsOf() === null) {
      morph.jump(collapsedBoundsOf(target))
    }
    setVisible(true)
    morph.to(target, { ...spring(areaOf(target) >= areaOf(morph.boundsOf())), onDone: syncHover })
  }

  // Le curseur n'est sondé que tant que l'île est cachée.
  const edgePoller = createEdgePoller({ clock, getCursor, getArea, onEdge: isAtEdge => fsm.edge(isAtEdge && !isFullscreenActive()) })

  const onChange = (to, from, cause) => {
    if (to === HIDDEN) edgePoller.start()
    else edgePoller.stop()
    place(to)
    syncHover()
    send('island-state', to, cause)
    // Lecteur d'écran : l'annonce n'est lue que si la fenêtre a le focus.
    if (from === HIDDEN && cause === 'event' && isScreenReaderActive()) focusWindow()
  }

  const fsm = createIslandFsm({ clock, onChange })

  const resize = () => {
    if (appliedPhase !== HIDDEN) place(appliedPhase)
  }

  return {
    phase: () => fsm.state(),
    isAnimating: () => morph.isRunning(),
    start() { fsm.reveal() },
    event() { fsm.reveal() },
    forceHide() {
      pageKind = 'none'
      isOffline = false
      fsm.forceHide()
    },
    // Accès clavier : révèle l'île, la montre tout de suite et donne le focus à la pastille.
    showAndFocus() {
      fsm.reveal()
      place(fsm.state())
      focusWindow()
      send('island-focus')
    },
    activity() { fsm.activity() },
    escape() { fsm.escape() },
    blur() { fsm.blur() },
    setPinned(kind) {
      pageKind = kind
      fsm.setPinned(isOffline ? 'attention' : kind)
    },
    setHeld(isHeld) { fsm.hold(isHeld === true) },
    setMotion(isReduced) { hasReducedMotion = isReduced === true },
    pointer(isInside) { setPointer(isInside === true) },
    setCompactSize(width, height) {
      sizes = { ...sizes, compactWidth: width, compactHeight: height }
      resize()
    },
    setExpanded(isOpen, width, height, byHover = false) {
      if (isOpen) sizes = { ...sizes, openWidth: width, openHeight: height }
      if (isOpen) fsm.open(byHover === true)
      else fsm.fold()
      if (isOpen) resize()
    },
    // Les toasts : de la place en plus sous l'île, sans toucher à l'automate.
    setToasts(width, height) {
      sizes = { ...sizes, toastWidth: Math.max(0, Math.round(Number(width)) || 0), toastHeight: Math.max(0, Math.round(Number(height)) || 0) }
      resize()
    },
    setOffline(isDown, width, height) {
      isOffline = isDown === true
      if (isOffline) sizes = { ...sizes, compactWidth: width, compactHeight: height, openWidth: 0, openHeight: 0 }
      fsm.setPinned(isOffline ? 'attention' : pageKind)
      resize()
    },
    dispose() {
      edgePoller.stop()
      fsm.dispose()
    },
  }
}

module.exports = { createIslandController }
