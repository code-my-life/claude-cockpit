// The setup assistant: shows the exact changes the cockpit makes to Claude
// Code's settings (the mod and the hook on Windows, the hook in each running WSL
// distro), and writes them only once the person clicks to install.
const { BrowserWindow, app, ipcMain } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { applyTargets, cachedWslTargets, planTarget, refreshInstalledScripts, scriptTextOf, uninstallTargets, windowsTarget } = require('./hook-install')

const SETTINGS_FILE = process.env.COCKPIT_SETTINGS_FILE || path.join(os.homedir(), '.claude', 'settings.json')
const MOD_DIR = path.join(__dirname, '..', 'mod').replace(/\\/g, '/')
const IS_E2E = process.env.COCKPIT_E2E === '1'
const WIZARD_WIDTH = 640
const WIZARD_HEIGHT = 720
const MOD_NAME = 'sessions'
const PAPER = '#17181b'

let wizardWin = null
let shownPlans = null

// Another copy of the cockpit mod (an older install, a working copy) is
// replaced so the conversations never load it twice.
const isCockpitMod = folder => {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, '.claude-plugin', 'plugin.json'), 'utf8'))
    return manifest.name === MOD_NAME && fs.existsSync(path.join(folder, 'assets', 'conversations.html'))
  } catch {
    return false
  }
}

// The e2e runs never reach the WSL distros of the machine.
const targetsNow = () => [windowsTarget(SETTINGS_FILE, MOD_DIR), ...(IS_E2E ? [] : cachedWslTargets())]

const currentPlans = () => {
  const scriptText = scriptTextOf(MOD_DIR)
  return targetsNow().map(target => planTarget(target, scriptText, isCockpitMod))
}

const isModInstalled = () => {
  try {
    return currentPlans().every(plan => plan.status === 'unchanged')
  } catch {
    return false
  }
}

// At launch: an installed hook script follows the app version.
const refreshHookScripts = () => {
  try {
    refreshInstalledScripts(targetsNow(), scriptTextOf(MOD_DIR))
  } catch {
    // The next launch tries again.
  }
}

// Run by the uninstaller (desktop/build/installer.nsh): Claude Code no longer points at the app.
const removeFromClaude = () => uninstallTargets(targetsNow())

const describeTarget = plan => ({
  label: plan.target.label,
  file: plan.target.settingsFile,
  changes: plan.settings.changes,
  script: plan.isScriptStale ? plan.target.scriptFile : null,
})

const fromWizard = event => wizardWin !== null && event.sender === wizardWin.webContents

const describePlan = () => {
  try {
    shownPlans = currentPlans()
    const status = shownPlans.every(plan => plan.status === 'unchanged') ? 'unchanged' : 'change'
    return { ok: true, file: SETTINGS_FILE, status, targets: shownPlans.filter(plan => plan.status === 'change').map(describeTarget), autostart: app.getLoginItemSettings().openAtLogin }
  } catch (error) {
    shownPlans = null
    return { ok: false, file: SETTINGS_FILE, error: error.message }
  }
}

// Applies exactly the plans the person saw; a file changed since is refused.
const applyShownPlan = options => {
  if (shownPlans === null) return { ok: false, error: 'aperçu manquant : rouvre l’assistant' }
  try {
    const backups = applyTargets(shownPlans, scriptTextOf(MOD_DIR))
    app.setLoginItemSettings({ openAtLogin: options?.autostart === true })
    shownPlans = null
    return { ok: true, backup: backups.join(', ') || null }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

const registerWizardIpc = onInstalled => {
  ipcMain.handle('wizard-plan', event => (fromWizard(event) ? describePlan() : null))
  ipcMain.handle('wizard-apply', (event, options) => {
    if (!fromWizard(event)) return null
    const result = applyShownPlan(options)
    if (result.ok) onInstalled()
    return result
  })
  ipcMain.on('wizard-close', event => {
    if (fromWizard(event)) wizardWin.close()
  })
}

const openWizard = webPreferences => {
  if (wizardWin !== null) return wizardWin.focus()
  wizardWin = new BrowserWindow({
    width: WIZARD_WIDTH,
    height: WIZARD_HEIGHT,
    title: 'Installer le cockpit',
    backgroundColor: PAPER,
    autoHideMenuBar: true,
    webPreferences: { ...webPreferences, preload: path.join(__dirname, 'wizard-preload.js') },
  })
  wizardWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  wizardWin.webContents.on('will-navigate', event => event.preventDefault())
  wizardWin.on('closed', () => { wizardWin = null })
  wizardWin.loadFile(path.join(__dirname, 'wizard', 'wizard.html')).catch(() => {})
}

module.exports = { isModInstalled, openWizard, refreshHookScripts, registerWizardIpc, removeFromClaude }
