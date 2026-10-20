// Morphose de la fenêtre de l'île : la fenêtre EST la forme (verre acrylique du système), donc c'est elle qui s'anime.
// Ressort à amortissement sous-critique sur la largeur et la hauteur, centre fixe, une image par tick du planificateur.
// Module pur : l'horloge, le planificateur et l'application des bornes sont injectés (testable sans Electron).
const clamp01 = value => Math.min(1, Math.max(0, value))

const springEase = ({ zeta, ms }) => {
  const omega = 2 * Math.PI / (ms / 1000)
  const damped = omega * Math.sqrt(1 - zeta * zeta)
  return progress => {
    if (progress <= 0) return 0
    if (progress >= 1) return 1
    const t = progress * ms / 1000
    return 1 - Math.exp(-zeta * omega * t) * (Math.cos(damped * t) + (zeta * omega / damped) * Math.sin(damped * t))
  }
}

const sameBounds = (first, second) => first !== null && second !== null && first.x === second.x && first.y === second.y && first.width === second.width && first.height === second.height

// onStart: told once when a morph starts (or a jump happens), so the page can draw the same shape on the same clock.
const createMorph = ({ now, schedule, cancel, apply, onStart = () => {} }) => {
  let current = null
  let applied = null
  let running = false
  let run = 0

  const emit = bounds => {
    if (sameBounds(bounds, applied)) return
    applied = bounds
    apply({ ...bounds })
  }

  // Place la fenêtre d'un coup, sans animation (premier affichage, mouvement réduit).
  const jump = bounds => {
    cancel()
    run += 1
    running = false
    current = { ...bounds }
    onStart({ from: { ...bounds }, to: { ...bounds }, ms: 0, zeta: 1, startedAt: now() })
    emit(current)
  }

  const to = (target, { ms, zeta, onDone = () => {} }) => {
    if (current === null || ms <= 0) { jump(target); onDone(); return }
    if (!running && sameBounds(current, target)) { onDone(); return }
    cancel()
    run += 1
    const token = run
    const from = { ...current }
    const centerX = target.x + target.width / 2
    const ease = springEase({ zeta, ms })
    const startedAt = now()
    onStart({ from: { ...from }, to: { ...target }, ms, zeta, startedAt })
    running = true
    const step = () => {
      if (token !== run) return
      const progress = clamp01((now() - startedAt) / ms)
      if (progress >= 1) {
        current = { ...target }
        running = false
        emit(current)
        onDone()
        return
      }
      const k = ease(progress)
      const width = Math.max(1, Math.round(from.width + (target.width - from.width) * k))
      const height = Math.max(1, Math.round(from.height + (target.height - from.height) * k))
      current = { x: Math.round(centerX - width / 2), y: Math.round(from.y + (target.y - from.y) * k), width, height }
      emit(current)
      schedule(step)
    }
    schedule(step)
  }

  // Oublie la géométrie (fenêtre cachée) : le prochain affichage repart d'une fenêtre posée à neuf.
  const reset = () => {
    cancel()
    run += 1
    running = false
    current = null
    applied = null
  }

  return { to, jump, reset, isRunning: () => running, boundsOf: () => (current === null ? null : { ...current }) }
}

module.exports = { createMorph, springEase }
