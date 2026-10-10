// The setup assistant: shows the exact change the cockpit makes to Claude
// Code's settings, and writes it only once the person clicks to install.
const { BrowserWindow, app, ipcMain } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { applyPlan, planAddPluginDir } = require('./settings-merge')

const SETTINGS_FILE = process.env.COCKPIT_SETTINGS_FILE || path.join(os.homedir(), '.claude', 'settings.json')
const MOD_DIR = path.join(__dirname, '..', 'mod').replace(/\\/g, '/')
const WIZARD_WIDTH = 640
const WIZARD_HEIGHT = 660
const PAPER = '#17181b'

let wizardWin = null
let shownPlan = null

const readSettingsText = () => (fs.existsSync(SETTINGS_FILE) ? fs.readFileSync(SETTINGS_FILE, 'utf8') : null)

const currentPlan = () => planAddPluginDir(readSettingsText(), MOD_DIR, process.platform)

const isModInstalled = () => {
  try {
    return currentPlan().status === 'unchanged'
  } catch {
    return false
  }
}

const fromWizard = event => wizardWin !== null && event.sender === wizardWin.webContents

const describePlan = () => {
  try {
    shownPlan = currentPlan()
    return { ok: true, file: SETTINGS_FILE, status: shownPlan.status, change: shownPlan.change, autostart: app.getLoginItemSettings().openAtLogin }
  } catch (error) {
    shownPlan = null
    return { ok: false, file: SETTINGS_FILE, error: error.message }
  }
}

// Applies exactly the plan the person saw; a file changed since is refused.
const applyShownPlan = options => {
  if (shownPlan === null) return { ok: false, error: 'aperçu manquant : rouvre l’assistant' }
  try {
    const backup = applyPlan(SETTINGS_FILE, shownPlan)
    app.setLoginItemSettings({ openAtLogin: options?.autostart === true })
    shownPlan = null
    return { ok: true, backup }
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

module.exports = { isModInstalled, openWizard, registerWizardIpc }
