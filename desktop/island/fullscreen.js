// Plein écran : tant qu'une application occupe tout l'écran (jeu, vidéo, présentation),
// le bord haut n'y révèle pas l'île. Windows le dit via SHQueryUserNotificationState.
const QUNS_NOT_PRESENT = 1
const QUNS_BUSY = 2
const QUNS_RUNNING_D3D_FULL_SCREEN = 3
const QUNS_PRESENTATION_MODE = 4
const QUNS_ACCEPTS_NOTIFICATIONS = 5
const QUNS_QUIET_TIME = 6
const QUNS_APP = 7

const FULLSCREEN_STATES = [QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE]

const isFullscreenState = code => FULLSCREEN_STATES.includes(code)

// Les sons se taisent dans ces états et aussi pendant les heures calmes (assistant de concentration).
const SILENT_STATES = [...FULLSCREEN_STATES, QUNS_QUIET_TIME]

const isSilentState = code => SILENT_STATES.includes(code)

// Sonde réelle (koffi, déjà utilisé par blur.js). Hors Windows ou en cas d'échec : jamais de plein écran.
const loadWindowsQuery = () => {
  const koffi = require('koffi')
  const shell32 = koffi.load('shell32.dll')
  const query = shell32.func('int __stdcall SHQueryUserNotificationState(_Out_ int *state)')
  return () => {
    const out = [0]
    query(out)
    return out[0]
  }
}

const createFullscreenProbe = ({ query = null, platform = process.platform } = {}) => {
  let run = query
  const stateIs = test => {
    try {
      if (run === null) {
        if (platform !== 'win32') return false
        run = loadWindowsQuery()
      }
      return test(run())
    } catch {
      return false
    }
  }
  return {
    isActive: () => stateIs(isFullscreenState),
    isSilent: () => stateIs(isSilentState),
  }
}

module.exports = { isFullscreenState, isSilentState, QUNS_QUIET_TIME, QUNS_APP, createFullscreenProbe, QUNS_NOT_PRESENT, QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE, QUNS_ACCEPTS_NOTIFICATIONS }
