// Automate de l'île : caché, réduit (compact), ouvert. Module pur : l'horloge
// est injectée, il ne sait rien d'Electron ni du DOM, il annonce des transitions.
const HIDE_DELAY_MS = 60 * 1000
const POINTER_HIDE_DELAY_MS = 4 * 1000
const FOLD_DELAY_MS = 15 * 1000
const HOVER_GRACE_MS = 600
const INTENT_DELAY_MS = 200
const PIN_DONE_MS = 3 * 60 * 1000

const HIDDEN = 'hidden'
const COMPACT = 'compact'
const OPEN = 'open'

const CAUSE_EVENT = 'event'
const CAUSE_POINTER = 'pointer'

const PIN_NONE = 'none'
const PIN_ATTENTION = 'attention'
const PIN_DONE = 'done'

const realClock = {
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: handle => clearTimeout(handle),
}

// true et false restent acceptés : épinglage fort ou aucun.
const pinKindOf = value => {
  if (value === true) return PIN_ATTENTION
  if (value === PIN_ATTENTION || value === PIN_DONE) return value
  return PIN_NONE
}

const createIslandFsm = ({ clock = realClock, onChange = () => {} } = {}) => {
  let current = HIDDEN
  let cause = CAUSE_EVENT
  let isHovered = false
  let pin = PIN_NONE
  let isDonePinExpired = false
  let timer = null
  let intentTimer = null
  let pinTimer = null

  const stop = handle => { if (handle !== null) clock.clearTimer(handle) }

  const clearTimer = () => { stop(timer); timer = null }
  const clearIntent = () => { stop(intentTimer); intentTimer = null }
  const clearPinTimer = () => { stop(pinTimer); pinTimer = null }

  const isPinned = () => pin === PIN_ATTENTION || (pin === PIN_DONE && !isDonePinExpired)

  const go = next => {
    if (next === current) return
    const previous = current
    current = next
    onChange(next, previous, cause)
  }

  const delayOf = () => {
    if (current === OPEN) return FOLD_DELAY_MS
    return cause === CAUSE_POINTER ? POINTER_HIDE_DELAY_MS : HIDE_DELAY_MS
  }

  const onTimer = () => {
    timer = null
    if (current === OPEN) go(COMPACT)
    else if (current === COMPACT) go(HIDDEN)
    rearm(0)
  }

  // Le compte à rebours ne tourne que si l'île est visible, libre et non survolée.
  function rearm(graceMs) {
    clearTimer()
    if (current === HIDDEN || isHovered || isPinned()) return
    timer = clock.setTimer(onTimer, delayOf() + graceMs)
  }

  const showCompact = () => { if (current === HIDDEN) go(COMPACT) }

  const markEvent = () => { cause = CAUSE_EVENT }

  const onIntent = () => {
    intentTimer = null
    if (current !== HIDDEN) return
    cause = CAUSE_POINTER
    go(COMPACT)
    rearm(0)
  }

  const onDonePinExpired = () => {
    pinTimer = null
    isDonePinExpired = true
    rearm(0)
  }

  const applyPin = kind => {
    if (kind === pin) return
    pin = kind
    isDonePinExpired = false
    clearPinTimer()
    if (pin === PIN_DONE) pinTimer = clock.setTimer(onDonePinExpired, PIN_DONE_MS)
  }

  return {
    state: () => current,
    // Présence du curseur au bord haut de l'écran : révèle après un délai d'intention.
    edge(isAtEdge) {
      if (current !== HIDDEN || isAtEdge !== true) { clearIntent(); return }
      if (intentTimer === null) intentTimer = clock.setTimer(onIntent, INTENT_DELAY_MS)
    },
    hover(isInside) {
      isHovered = isInside === true
      rearm(isHovered ? 0 : HOVER_GRACE_MS)
    },
    reveal() {
      markEvent()
      clearIntent()
      showCompact()
      rearm(0)
    },
    activity() { rearm(0) },
    open() {
      markEvent()
      clearIntent()
      go(OPEN)
      rearm(0)
    },
    fold() {
      if (current === OPEN) go(COMPACT)
      rearm(0)
    },
    escape() {
      if (current === OPEN) go(COMPACT)
      else if (current === COMPACT && !isPinned()) go(HIDDEN)
      rearm(0)
    },
    setPinned(value) {
      applyPin(pinKindOf(value))
      if (isPinned()) { markEvent(); showCompact() }
      rearm(0)
    },
    // Masquage demandé par l'utilisateur : ignore l'épinglage, qui se réarme à la prochaine attente.
    forceHide() {
      applyPin(PIN_NONE)
      isHovered = false
      clearIntent()
      clearTimer()
      go(HIDDEN)
    },
    dispose() {
      clearTimer()
      clearIntent()
      clearPinTimer()
    },
  }
}

module.exports = {
  createIslandFsm, HIDE_DELAY_MS, POINTER_HIDE_DELAY_MS, FOLD_DELAY_MS, HOVER_GRACE_MS, INTENT_DELAY_MS, PIN_DONE_MS,
  HIDDEN, COMPACT, OPEN, CAUSE_EVENT, CAUSE_POINTER, PIN_NONE, PIN_ATTENTION, PIN_DONE,
}
