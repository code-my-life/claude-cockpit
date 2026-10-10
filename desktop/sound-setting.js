// Le réglage global des sons, gardé dans le dossier userData de l'app (sound.json) : activé tant que rien n'est stocké.
// Pur : la lecture et l'écriture du fichier se font dans main.js.
const SOUND_FILE_NAME = 'sound.json'

const readSoundSetting = raw => {
  if (typeof raw !== 'string' || raw.trim() === '') return true
  try {
    const stored = JSON.parse(raw)
    return stored !== null && typeof stored === 'object' && typeof stored.enabled === 'boolean' ? stored.enabled : true
  } catch {
    return true
  }
}

const serializeSoundSetting = enabled => JSON.stringify({ enabled: enabled === true })

module.exports = { SOUND_FILE_NAME, readSoundSetting, serializeSoundSetting }
