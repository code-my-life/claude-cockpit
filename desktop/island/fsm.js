// Automate de l'île : caché, réduit (compact), ouvert. Module pur : l'horloge
// est injectée, il ne sait rien d'Electron ni du DOM, il annonce des transitions.
const HIDE_DELAY_MS = 60 * 1000
const FOLD_DELAY_MS = 15 * 1000
const HOVER_GRACE_MS = 600

const HIDDEN = 'hidden'
const COMPACT = 'compact'
const OPEN = 'open'

const realClock = {
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: handle => clearTimeout(handle),
}

const createIslandFsm = ({ clock = realClock, onChange = () => {} } = {}) => {
  let current = HIDDEN
  let isHovered = false
  let isPinned = false
  let timer = null

  const clearTimer = () => {
    if (timer === null) return
    clock.clearTimer(timer)
    timer = null
  }

  const go = next => {
    if (next === current) return
    const previous = current
    current = next
    onChange(next, previous)
  }

  const delayOf = () => (current === OPEN ? FOLD_DELAY_MS : HIDE_DELAY_MS)

  const onTimer = () => {
    timer = null
    if (current === OPEN) go(COMPACT)
    else if (current === COMPACT) go(HIDDEN)
    rearm(0)
  }

  // Le compte à rebours ne tourne que si l'île est visible, libre et non survolée.
  function rearm(graceMs) {
    clearTimer()
    if (current === HIDDEN || isHovered || isPinned) return
    timer = clock.setTimer(onTimer, delayOf() + graceMs)
  }

  const showCompact = () => { if (current === HIDDEN) go(COMPACT) }

  return {
    state: () => current,
    hover(isInside) {
      isHovered = isInside === true
      if (isHovered) showCompact()
      rearm(isHovered ? 0 : HOVER_GRACE_MS)
    },
    reveal() {
      showCompact()
      rearm(0)
    },
    activity() { rearm(0) },
    open() {
      go(OPEN)
      rearm(0)
    },
    fold() {
      if (current === OPEN) go(COMPACT)
      rearm(0)
    },
    escape() {
      if (current === OPEN) go(COMPACT)
      else if (current === COMPACT && !isPinned) go(HIDDEN)
      rearm(0)
    },
    setPinned(pinned) {
      isPinned = pinned === true
      if (isPinned) showCompact()
      rearm(0)
    },
    dispose: clearTimer,
  }
}

module.exports = { createIslandFsm, HIDE_DELAY_MS, FOLD_DELAY_MS, HOVER_GRACE_MS, HIDDEN, COMPACT, OPEN }
