// Updates from the GitHub releases, kept free of Electron so it can be tested:
// a new version downloads in the background, the tray then offers to restart
// into it, and quitting the app installs it anyway.
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const FIRST_CHECK_DELAY_MS = 30 * 1000

const REASON_MAX_CHARS = 200

// electron-updater puts the whole HTTP reply in its messages, cookies included:
// the log keeps the status and the request, on one short line.
const reasonOf = error => {
  const message = error instanceof Error ? error.message : String(error)
  const [head] = message.split('\nHeaders:')
  return head.replace(/"/g, '').replace(/(\\n|\s)+/g, ' ').trim().slice(0, REASON_MAX_CHARS)
}

// `autoUpdater` is electron-updater's; `onChange(status)` hears every change of status.
const createUpdater = ({ autoUpdater, log, onChange = () => {}, setTimer = setTimeout, setRepeat = setInterval }) => {
  let status = { phase: 'idle', version: null }

  const moveTo = next => {
    status = next
    onChange(status)
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('update-available', info => moveTo({ phase: 'downloading', version: info.version }))
  autoUpdater.on('update-not-available', () => moveTo({ phase: 'idle', version: null }))
  autoUpdater.on('update-downloaded', info => {
    log(`mise à jour v${info.version} prête, installée au prochain redémarrage`)
    moveTo({ phase: 'ready', version: info.version })
  })
  autoUpdater.on('error', error => {
    // A failed check is logged once, where the check fails.
    if (status.phase === 'checking') return
    log(`mise à jour : ${reasonOf(error)}`)
    // A version already downloaded stays ready; anything else is tried again later.
    if (status.phase !== 'ready') moveTo({ phase: 'idle', version: null })
  })

  const check = () => {
    if (status.phase !== 'idle') return
    moveTo({ phase: 'checking', version: null })
    Promise.resolve()
      .then(() => autoUpdater.checkForUpdates())
      .catch(error => log(`mise à jour : vérification impossible (${reasonOf(error)})`))
      // A check that ended without saying anything (no release yet) is tried again later.
      .then(() => {
        if (status.phase === 'checking') moveTo({ phase: 'idle', version: null })
      })
  }

  const start = () => {
    setTimer(check, FIRST_CHECK_DELAY_MS)
    setRepeat(check, CHECK_EVERY_MS)
  }

  // Restarts into the downloaded version; nothing to do before one is ready.
  const install = () => {
    if (status.phase !== 'ready') return false
    autoUpdater.quitAndInstall(true, true)
    return true
  }

  return { start, check, install, status: () => status }
}

module.exports = { createUpdater, CHECK_EVERY_MS, FIRST_CHECK_DELAY_MS }
