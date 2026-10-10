// Écriture atomique : le contenu va dans un fichier temporaire voisin, puis un renommage le pose d'un coup.
// Une coupure en cours d'écriture ne laisse jamais un fichier tronqué.
const fs = require('node:fs')

const TEMP_SUFFIX = '.tmp'

const writeFileAtomic = (file, text, { rename = fs.renameSync } = {}) => {
  const temporary = `${file}${TEMP_SUFFIX}`
  try {
    fs.writeFileSync(temporary, text)
    rename(temporary, file)
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }) } catch { }
    throw error
  }
}

module.exports = { writeFileAtomic }
