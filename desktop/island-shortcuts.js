// Global shortcuts of the island. None of them takes one of coucou's
// (Control+Alt+Space, A, T, S, G, D, N and the arrows), so both apps run side
// by side; a shortcut another app already holds is skipped and reported.
const ISLAND_SHORTCUTS = [
  { accelerator: 'Control+Alt+I', action: 'toggle', label: 'Ouvrir ou replier l’île' },
  { accelerator: 'Control+Alt+R', action: 'waiting', label: 'Aller à ce qui t’attend' },
  { accelerator: 'Control+Alt+PageDown', action: 'next', label: 'Conversation suivante' },
  { accelerator: 'Control+Alt+PageUp', action: 'previous', label: 'Conversation précédente' },
  { accelerator: 'Control+Alt+V', action: 'sounds', label: 'Couper ou activer les sons' },
]

const tryRegister = (keys, accelerator, run) => {
  try {
    return keys.register(accelerator, run) === true
  } catch {
    return false
  }
}

// `run(action)` is called with the shortcut's action each time it is pressed.
const registerIslandShortcuts = (keys, run) => {
  const registered = []
  const failed = []
  for (const shortcut of ISLAND_SHORTCUTS) {
    const isRegistered = tryRegister(keys, shortcut.accelerator, () => run(shortcut.action))
    if (isRegistered) registered.push(shortcut.accelerator)
    else failed.push(shortcut.accelerator)
  }
  return { registered, failed }
}

module.exports = { ISLAND_SHORTCUTS, registerIslandShortcuts }
