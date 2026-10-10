const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, nativeTheme, screen, session, shell } = require('electron')
const crypto = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')
const { createIslandController } = require('./island/controller')
const { applyBlur } = require('./blur')
const { launcherBoundsOf, LAUNCHER_WIDTH, LAUNCHER_MIN_HEIGHT } = require('./launcher')
const { createFullscreenProbe } = require('./island/fullscreen')
const { startEmbeddedServer } = require('./embedded-server')
const { trayIconBitmap, trayMenuOf, TRAY_ICON_SIZE } = require('./tray-model')
const { isModInstalled, openWizard, registerWizardIpc } = require('./wizard')
const { SOUND_FILE_NAME, readSoundState, serializeSoundState, parseSoundChoice, introDecision } = require('./sound-setting')
const { writeFileAtomic } = require('./atomic-write')

// The app serves the cockpit itself; when its server cannot start, the windows
// fall back on the server a conversation with the mod runs on this port.
const MOD_SERVER_PORT = 48123
let serverPort = MOD_SERVER_PORT
let embeddedServer = null
// The page token lives only in an HttpOnly cookie of the app's own windows.
const PAGE_TOKEN = crypto.randomBytes(32).toString('hex')
const SESSION_COOKIE = 'cockpit_session'
const cockpitBase = () => `http://127.0.0.1:${serverPort}/`
// The page only switches to the OS-glass look when the window really has a native blur behind it.
let hasOsBlur = false
const glassParam = () => (hasOsBlur ? '&glass=1' : '')
// L'île est une fenêtre transparente : elle dessine sa propre forme, sans flou du système.
const miniUrl = () => `${cockpitBase()}?mini=1`
const cockpitUrl = () => (hasOsBlur ? `${cockpitBase()}?glass=1` : cockpitBase())
const launcherUrl = () => `${cockpitBase()}?launcher=1${glassParam()}`
const LAUNCHER_SHORTCUTS = process.platform === 'darwin' ? ['Command+Alt+Space', 'Control+Alt+Space'] : ['Alt+Space', 'Control+Alt+Space']
const RETRY_MS = 5000
const ERR_ABORTED = -3
const OFFLINE_WIDTH = 380
const OFFLINE_HEIGHT = 44
const COCKPIT_WIDTH = 1180
const COCKPIT_HEIGHT = 900
const CLEAR = '#00000000'
const TITLE_SYMBOLS = '#ecece6'
const TITLE_BAR_HEIGHT = 36
const SECURE_WEB_PREFERENCES = { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
// Page de secours (URL data:, sans accès aux jetons CSS). Ces valeurs sont le miroir du thème chargé
// par le cockpit, <html data-theme="dark"> (Nuit) dans conversations.html, jamais changé à l'exécution :
// margin 16px = --space-4, fond #1b1c20 = --plate, rayon 24px = --radius-glass, texte #a5a8ae = --ink-2,
// Consolas en repli de --font-mono. À mettre à jour avec le thème.
const OFFLINE_PAGE = `data:text/html;charset=utf-8,${encodeURIComponent('<body style="margin:16px;background:#1b1c20;border-radius:24px;height:calc(100vh - 32px);display:flex;align-items:center;justify-content:center;font:500 11px/1 Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:#a5a8ae">Cockpit éteint : ouvre une conversation Claude</body>')}`

let win = null
let cockpitWin = null
let launcherWin = null
let launcherHeight = LAUNCHER_MIN_HEIGHT
let isLauncherBroken = false
let activeShortcut = null
let island = null

const MAX_SERVER_RESTARTS = 3
const RESTART_WINDOW_MS = 10 * 60 * 1000
let serverRestarts = []

const logLine = message => {
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'cockpit.log'), `${new Date().toISOString()} ${message}\n`) } catch { }
}

const reloadWindows = () => {
  loadCockpit()
  if (cockpitWin !== null) cockpitWin.loadURL(cockpitUrlOf(null)).catch(() => {})
  if (launcherWin !== null) launcherWin.loadURL(launcherUrl()).catch(() => {})
}

// A server that dies while the app runs is started again, a few times at most,
// with a fresh secret and link; past that the windows fall back on the mod's.
const restartServer = async code => {
  logLine(`serveur intégré arrêté (code ${code})`)
  embeddedServer = null
  serverPort = MOD_SERVER_PORT
  const now = Date.now()
  serverRestarts = serverRestarts.filter(at => now - at < RESTART_WINDOW_MS)
  if (serverRestarts.length < MAX_SERVER_RESTARTS) {
    serverRestarts = [...serverRestarts, now]
    await startServer()
  }
  reloadWindows()
}

const setSessionCookie = () =>
  session.defaultSession.cookies.set({ url: cockpitBase(), name: SESSION_COOKIE, value: PAGE_TOKEN, httpOnly: true, sameSite: 'strict', path: '/' })

// A one-time ticket hands the session cookie to the default browser.
const openInBrowser = () => {
  if (embeddedServer === null) return
  const ticket = crypto.randomBytes(24).toString('hex')
  embeddedServer.allowTicket(ticket)
  shell.openExternal(`${cockpitBase()}open?ticket=${ticket}`)
}

const startServer = async () => {
  try {
    embeddedServer = await startEmbeddedServer({ appVersion: app.getVersion(), pageToken: PAGE_TOKEN, onError: message => logLine(`serveur : ${message}`), onExit: restartServer })
    serverPort = embeddedServer.port
    await setSessionCookie()
  } catch (error) {
    logLine(`serveur intégré indisponible, repli sur celui du mod : ${error.message}`)
  }
}

const workArea = () => screen.getPrimaryDisplay().workArea

const fullscreenProbe = createFullscreenProbe()

// Le contrôleur d'île tient l'automate, la géométrie et les clics traversants.
const createIsland = () => createIslandController({
  getArea: workArea,
  applyBounds: bounds => { if (win !== null) win.setBounds(bounds) },
  // La forme (dock, fiche) capte la souris ; le reste de la fenêtre laisse passer les clics.
  applyShape: rects => { if (win !== null) win.setShape(rects) },
  getCursor: () => screen.getCursorScreenPoint(),
  // Caché, l'île n'a plus de fenêtre : le bord haut est surveillé par sondage du curseur.
  setVisible: isVisible => {
    if (win === null) return
    if (isVisible && !win.isVisible()) win.showInactive()
    if (!isVisible && win.isVisible()) win.hide()
  },
  focusWindow: () => { if (win !== null) win.focus() },
  isFullscreenActive: () => fullscreenProbe.isActive(),
  isScreenReaderActive: () => app.isAccessibilitySupportEnabled(),
  send: (channel, payload, cause) => { if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload, cause) },
})

const loadCockpit = () => {
  if (win === null) return
  win.loadURL(miniUrl()).catch(() => {})
}

const openOutside = url => {
  if (/^(https?|claude):\/\//i.test(url)) shell.openExternal(url)
}

const isTrusted = event => typeof event.senderFrame?.url === 'string' && event.senderFrame.url.startsWith(cockpitBase())

const onTrusted = (channel, listener) => ipcMain.on(channel, (event, ...args) => { if (isTrusted(event)) listener(event, ...args) })

const handleTrusted = (channel, listener) => ipcMain.handle(channel, (event, ...args) => (isTrusted(event) ? listener(event, ...args) : undefined))

const guardNavigation = target => {
  target.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: 'deny' }
  })
  target.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(cockpitBase())) return
    event.preventDefault()
    openOutside(url)
  })
}

const cockpitUrlOf = section => (section === 'search' ? `${cockpitUrl()}#recherche` : cockpitUrl())

const openCockpitWindow = section => {
  const target = cockpitUrlOf(section)
  if (cockpitWin !== null) {
    if (cockpitWin.isMinimized()) cockpitWin.restore()
    cockpitWin.focus()
    if (section === 'search') cockpitWin.loadURL(target).catch(() => {})
    return
  }
  cockpitWin = new BrowserWindow({
    width: COCKPIT_WIDTH,
    height: COCKPIT_HEIGHT,
    title: 'Ton équipe',
    backgroundColor: CLEAR,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: CLEAR, symbolColor: TITLE_SYMBOLS, height: TITLE_BAR_HEIGHT },
    autoHideMenuBar: true,
    webPreferences: SECURE_WEB_PREFERENCES,
  })
  hasOsBlur = applyBlur(cockpitWin)
  guardNavigation(cockpitWin)
  cockpitWin.on('closed', () => { cockpitWin = null })
  cockpitWin.loadURL(target).catch(() => {})
}

const placeLauncher = () => {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const bounds = launcherBoundsOf(display.workArea, launcherHeight)
  launcherWin.setBounds(bounds)
}

const hideLauncher = () => {
  if (launcherWin !== null && launcherWin.isVisible()) launcherWin.hide()
}

const createLauncherWindow = () => {
  launcherWin = new BrowserWindow({
    width: LAUNCHER_WIDTH,
    height: LAUNCHER_MIN_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: CLEAR,
    webPreferences: { ...SECURE_WEB_PREFERENCES, preload: path.join(__dirname, 'preload.js') },
  })
  hasOsBlur = applyBlur(launcherWin)
  launcherWin.setAlwaysOnTop(true, 'pop-up-menu')
  guardNavigation(launcherWin)
  launcherWin.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== ERR_ABORTED) isLauncherBroken = true
  })
  launcherWin.on('blur', hideLauncher)
  launcherWin.on('closed', () => { launcherWin = null })
  launcherWin.loadURL(launcherUrl()).catch(() => {})
}

const showLauncher = () => {
  if (launcherWin === null) createLauncherWindow()
  if (isLauncherBroken) {
    isLauncherBroken = false
    launcherWin.loadURL(launcherUrl()).catch(() => {})
  }
  placeLauncher()
  launcherWin.show()
  launcherWin.focus()
  launcherWin.webContents.send('launcher-shown')
}

const toggleLauncher = () => {
  const isOpen = launcherWin !== null && launcherWin.isVisible()
  if (isOpen) hideLauncher()
  else showLauncher()
}

const registerLauncherShortcut = () => {
  for (const accelerator of LAUNCHER_SHORTCUTS) {
    const isRegistered = globalShortcut.register(accelerator, toggleLauncher)
    if (isRegistered) {
      activeShortcut = accelerator
      return
    }
  }
}

const BOOT_SIZE = 1

const createWindow = () => {
  win = new BrowserWindow({
    width: BOOT_SIZE,
    height: BOOT_SIZE,
    minWidth: BOOT_SIZE,
    minHeight: BOOT_SIZE,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: CLEAR,
    // Caché, la page doit continuer à tourner pour voir arriver les événements.
    // Les sons servent justement quand on ne regarde pas : l'île cachée doit pouvoir les jouer sans geste préalable.
    webPreferences: { ...SECURE_WEB_PREFERENCES, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', preload: path.join(__dirname, 'preload.js') },
  })
  win.setAlwaysOnTop(true, 'floating')
  island = createIsland()
  island.start()
  guardNavigation(win)
  win.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === ERR_ABORTED) return
    island.setOffline(true, OFFLINE_WIDTH, OFFLINE_HEIGHT)
    win.loadURL(OFFLINE_PAGE).catch(() => {})
    setTimeout(loadCockpit, RETRY_MS)
  })
  win.webContents.on('did-finish-load', () => {
    if (!win.webContents.getURL().startsWith(cockpitBase())) return
    island.setOffline(false)
    win.webContents.send('island-state', island.phase())
  })
  win.webContents.session.on('will-download', event => event.preventDefault())
  win.on('closed', () => { island.dispose(); island = null; win = null })
  loadCockpit()
}

let tray = null
const TRAY_SCALE = 2

const toggleDock = () => {
  if (win === null) return createWindow()
  if (win.isVisible()) island.forceHide()
  else island.event()
}

// Accès clavier : l'île apparaît et le focus va au premier bouton du dock.
const showIsland = () => {
  if (win === null) createWindow()
  island.showAndFocus()
}

// Réglage global des sons, gardé dans userData (écriture atomique) et transmis à la page de l'île.
const soundFile = () => path.join(app.getPath('userData'), SOUND_FILE_NAME)
let soundState = { enabled: true, isIntroShown: false }
const areSoundsOn = () => soundState.enabled

const loadSoundSetting = () => {
  let raw = null
  try { raw = fs.readFileSync(soundFile(), 'utf8') } catch { raw = null }
  soundState = readSoundState(raw)
}

const saveSoundState = next => {
  soundState = next
  try { writeFileAtomic(soundFile(), serializeSoundState(next)) } catch (error) { logLine(`sons : réglage non enregistré (${error.message})`) }
}

// Une seule voie pour le menu de la barre d'état et l'interrupteur du dock : écrire, prévenir la page, remettre le menu à jour.
const setSounds = enabled => {
  if (enabled === soundState.enabled) return
  saveSoundState({ ...soundState, enabled })
  win?.webContents.send('sound-setting', enabled)
  refreshTrayMenu()
}

const toggleSounds = () => setSounds(!soundState.enabled)

const toggleAutostart = () => app.setLoginItemSettings({ openAtLogin: !app.getLoginItemSettings().openAtLogin })

const refreshTrayMenu = () => {
  if (tray === null) return
  const actions = { 'open-cockpit': () => openCockpitWindow(null), 'open-browser': openInBrowser, 'install-mod': () => openWizard(SECURE_WEB_PREFERENCES), 'show-island': showIsland, 'toggle-dock': toggleDock, autostart: toggleAutostart, 'toggle-sounds': toggleSounds, quit: () => app.quit() }
  const state = { isDockVisible: win !== null && win.isVisible(), isAutostart: app.getLoginItemSettings().openAtLogin, areSoundsOn: areSoundsOn(), canOpenInBrowser: embeddedServer !== null, canInstallMod: !isModInstalled() }
  const template = trayMenuOf(state).map(item => (item.id === undefined ? item : { ...item, click: () => { actions[item.id](); refreshTrayMenu() } }))
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

const createTray = () => {
  const icon = nativeImage.createFromBitmap(trayIconBitmap(TRAY_ICON_SIZE), { width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE, scaleFactor: TRAY_SCALE })
  tray = new Tray(icon)
  tray.setToolTip('Claude Cockpit')
  tray.on('click', () => openCockpitWindow(null))
  refreshTrayMenu()
}

onTrusted('dock-size', (event, width, height) => island?.setDockSize(Math.round(Number(width)), Math.round(Number(height))))

onTrusted('expanded', (event, expanded, width, height) => {
  island?.setExpanded(expanded === true, Math.round(Number(width)), Math.round(Number(height)))
  if (expanded === true && win !== null) win.focus()
})

onTrusted('island-pointer', (event, isInside) => island?.pointer(isInside === true))

onTrusted('island-event', () => island?.event())

const PIN_KINDS = ['none', 'attention', 'done']

onTrusted('island-pinned', (event, kind) => island?.setPinned(PIN_KINDS.includes(kind) ? kind : 'none'))

onTrusted('island-activity', () => island?.activity())

onTrusted('island-escape', () => island?.escape())

onTrusted('island-motion', (event, isReduced) => island?.setMotion(isReduced === true))

onTrusted('open-cockpit', (event, section) => openCockpitWindow(section === 'search' ? 'search' : null))

onTrusted('open-link', (event, url) => openOutside(String(url)))

onTrusted('launcher-height', (event, height) => {
  launcherHeight = Math.round(Number(height) || LAUNCHER_MIN_HEIGHT)
  if (launcherWin !== null && launcherWin.isVisible()) placeLauncher()
})

onTrusted('launcher-hide', hideLauncher)

handleTrusted('launcher-shortcut', () => activeShortcut)
handleTrusted('sound-setting', () => areSoundsOn())
onTrusted('set-sound', (event, value) => {
  const choice = parseSoundChoice(value)
  if (choice !== null) setSounds(choice)
})
// Pas de son en plein écran, présentation, état occupé ni heures calmes : décidé ici, au moment du son.
handleTrusted('sound-silent', () => fullscreenProbe.isSilent())
// L'annonce du premier lancement : vraie une seule fois, puis mémorisée.
handleTrusted('sound-intro', () => {
  const { shouldShow, next } = introDecision(soundState)
  if (shouldShow) saveSoundState(next)
  return shouldShow
})
onTrusted('sound-log', (event, message) => logLine(String(message).slice(0, 300)))

onTrusted('quit', () => app.quit())

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    island?.event()
  })
  app.whenReady().then(async () => {
    if (process.platform === 'darwin') app.dock?.hide()
    nativeTheme.themeSource = 'dark'
    loadSoundSetting()
    await startServer()
    createWindow()
    createLauncherWindow()
    registerLauncherShortcut()
    createTray()
    registerWizardIpc(refreshTrayMenu)
    if (!isModInstalled()) openWizard(SECURE_WEB_PREFERENCES)
  })
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    embeddedServer?.stop()
  })
  app.on('window-all-closed', () => app.quit())
}
