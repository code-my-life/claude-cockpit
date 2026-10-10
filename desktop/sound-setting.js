// Le réglage global des sons, gardé dans le dossier userData de l'app (sound.json) : activé tant que rien n'est stocké.
// Le fichier retient aussi si l'annonce du premier lancement a été montrée. Pur : la lecture et l'écriture du fichier se font dans main.js.
const SOUND_FILE_NAME = 'sound.json'
const DEFAULT_STATE = { enabled: true, isIntroShown: false }

const readSoundState = raw => {
  if (typeof raw !== 'string' || raw.trim() === '') return { ...DEFAULT_STATE }
  try {
    const stored = JSON.parse(raw)
    if (stored === null || typeof stored !== 'object') return { ...DEFAULT_STATE }
    return {
      enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULT_STATE.enabled,
      isIntroShown: stored.isIntroShown === true,
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

const serializeSoundState = state => JSON.stringify({ enabled: state.enabled === true, isIntroShown: state.isIntroShown === true })

const readSoundSetting = raw => readSoundState(raw).enabled

const serializeSoundSetting = enabled => JSON.stringify({ enabled: enabled === true })

// Ce que la page demande d'écrire : un vrai booléen, sinon rien (null).
const parseSoundChoice = value => (typeof value === 'boolean' ? value : null)

// L'annonce du premier lancement : une fois, et seulement quand les sons sont actifs.
const introDecision = state => {
  if (!state.enabled || state.isIntroShown) return { shouldShow: false, next: state }
  return { shouldShow: true, next: { ...state, isIntroShown: true } }
}

module.exports = { SOUND_FILE_NAME, readSoundState, serializeSoundState, readSoundSetting, serializeSoundSetting, parseSoundChoice, introDecision }
