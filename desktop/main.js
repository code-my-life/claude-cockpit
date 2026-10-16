const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, nativeTheme, screen, session, shell } = require('electron')
const crypto = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')
const { createIslandController } = require('./island/controller')
const { applyBlur, NIGHT_TINT } = require('./blur')
const { launcherBoundsOf, LAUNCHER_WIDTH, LAUNCHER_MIN_HEIGHT } = require('./launcher')
const { createFullscreenProbe } = require('./island/fullscreen')
const { themeOf, sampleRectsOf, gridPointsOf, meanLuminanceOf } = require('./island/backdrop')
const { readPixels } = require('./island/pixels')
const { startEmbeddedServer } = require('./embedded-server')
const { registerIslandShortcuts } = require('./island-shortcuts')
const { trayIconBitmap, trayMenuOf, TRAY_ICON_SIZE } = require('./tray-model')
const { isModInstalled, openWizard, registerWizardIpc } = require('./wizard')
const { SOUND_FILE_NAME, readSoundState, serializeSoundState, parseSoundChoice, introDecision, oneLine } = require('./sound-setting')
const { writeFileAtomic } = require('./atomic-write')
const { createUpdater } = require('./updater')

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
// L'île est une fenêtre à verre acrylique du système : la fenêtre EST la forme (voir island/morph.js). La page ne pose que
// sa teinte et ses reflets par-dessus le flou de Windows, sans backdrop-filter.
let hasIslandBlur = false
const islandUrl = () => `${cockpitBase()}?island=1${hasIslandBlur ? '&glass=1' : ''}`
const cockpitUrl = () => (hasOsBlur ? `${cockpitBase()}?glass=1` : cockpitBase())
const launcherUrl = () => `${cockpitBase()}?launcher=1${glassParam()}`
const LAUNCHER_SHORTCUTS = process.platform === 'darwin' ? ['Command+Alt+Space', 'Control+Alt+Space'] : ['Alt+Space', 'Control+Alt+Space']
// Teinte du verre de l'île, légère : le bureau doit se voir nettement. Le verre acrylique du système est sombre à sa base ; sur un
// bureau clair la teinte est claire et la page passe en Papier (voir island/backdrop.js). Format 0xAABBGGRR.
const ISLAND_TINTS = { dark: 0x28121316, light: 0x40ecf0f0 }
const BACKDROP_UNIT = 4
// 12 lectures : GetPixel coûte environ 4 ms le pixel sur le bureau composé, donc peu de points, et jamais pendant une morphose.
const BACKDROP_COLUMNS = 3
const BACKDROP_ROWS = 2
const BACKDROP_DEBOUNCE_MS = 500
const BACKDROP_EVERY_MS = 8000
// Réglage de mise au point : ralentit la morphose (variable d'environnement du lanceur, jamais exposée à la page).
const MOTION_SCALE = Number(process.env.COCKPIT_ISLAND_SLOW) || 1
// Mode test de bout en bout, posé par le harnais Playwright (desktop/test) : dossier de données à part (--user-data-dir), serveur sur un
// port libre, ni raccourcis globaux, ni sons, ni mises à jour, ni assistant d'installation.
const IS_E2E = process.env.COCKPIT_E2E === '1'
const ANY_FREE_PORT = 0
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

// Une demande de permission réveille l'île ; la page lit ensuite les demandes elle-même.
const announcePermissions = count => {
  if (win !== null && !win.isDestroyed()) win.webContents.send('permissions-changed', count)
  if (count > 0) island?.event()
}

const startServer = async () => {
  try {
    embeddedServer = await startEmbeddedServer({ appVersion: app.getVersion(), pageToken: PAGE_TOKEN, preferredPort: IS_E2E ? ANY_FREE_PORT : undefined, onError: message => logLine(`serveur : ${message}`), onExit: restartServer, onPermissions: announcePermissions })
    serverPort = embeddedServer.port
    await setSessionCookie()
  } catch (error) {
    logLine(`serveur intégré indisponible, repli sur celui du mod : ${error.message}`)
  }
}

const workArea = () => screen.getPrimaryDisplay().workArea

const fullscreenProbe = createFullscreenProbe({ onError: error => logLine(`sonde de l'état Windows en échec, les sons ne se taisent plus selon cet état (${oneLine(error && error.message)})`) })

// Thème de l'île selon le bureau derrière (Nuit ou Papier) : on mesure la luminance de part et d'autre de l'île, puis la teinte acrylique et la page suivent. Une mesure à l'apparition, puis toutes les 8 s tant qu'elle est visible.
let islandTheme = 'dark'
const setIslandTheme = theme => {
  if (win === null || win.isDestroyed()) return
  if (theme !== islandTheme) {
    islandTheme = theme
    applyBlur(win, undefined, undefined, ISLAND_TINTS[theme])
  }
  win.webContents.send('island-theme', theme)
}

// Quelques pixels de l'écran de part et d'autre de l'île (GetPixel) : environ 50 ms, contre 350 ms pour une capture, et seulement hors morphose.
const backdropLuminance = () => {
  const bounds = win.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const island = screen.dipToScreenRect(win, bounds)
  const area = screen.dipToScreenRect(win, display.bounds)
  const points = gridPointsOf(sampleRectsOf(island, area, BACKDROP_UNIT), BACKDROP_COLUMNS, BACKDROP_ROWS)
  return meanLuminanceOf(readPixels(points))
}

let sampleTimer = null
const requestBackdropSample = () => {
  clearTimeout(sampleTimer)
  sampleTimer = setTimeout(sampleBackdrop, BACKDROP_DEBOUNCE_MS)
}

const sampleBackdrop = () => {
  if (win === null || win.isDestroyed() || !win.isVisible()) return
  if (island !== null && island.isAnimating()) { requestBackdropSample(); return }
  try {
    setIslandTheme(themeOf(islandTheme, backdropLuminance()))
  } catch (error) {
    logLine(`thème de l'île : mesure du bureau impossible (${oneLine(error && error.message)})`)
  }
}

// Le contrôleur d'île tient l'automate et la géométrie : la fenêtre épouse l'île et s'anime avec elle.
const createIsland = () => createIslandController({
  getArea: workArea,
  applyBounds: bounds => { if (win !== null) win.setBounds(bounds); if (process.env.DBG_BOUNDS) fs.appendFileSync(process.env.DBG_BOUNDS, Date.now() + ' ' + JSON.stringify(bounds) + ' ' + new Error().stack.split(String.fromCharCode(10)).slice(2, 5).map(x => x.slice(-70)).join(' < ') + String.fromCharCode(10)) },
  motionScale: MOTION_SCALE,
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
  send: (channel, payload, cause) => {
    if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload, cause)
    if (channel === 'island-state' && payload !== 'hidden') requestBackdropSample()
  },
})

const loadCockpit = () => {
  if (win === null) return
  win.loadURL(islandUrl()).catch(() => {})
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

// Raccourcis globaux de l'île : le son se règle ici, le reste ouvre l'île (avec le focus clavier) sur la bonne vue.
const runIslandShortcut = action => {
  if (action === 'sounds') return setSounds(!areSoundsOn())
  if (island === null || win === null || win.isDestroyed()) return
  if (action === 'toggle' && island.phase() === 'open') return island.escape()
  // Pas showAndFocus : son « island-focus » poserait le focus sur la pastille, inerte une fois l'île ouverte.
  island.event()
  win.focus()
  win.webContents.send('island-command', action)
}

const registerIslandKeys = () => {
  const { registered, failed } = registerIslandShortcuts(globalShortcut, runIslandShortcut)
  logLine(`raccourcis de l'île : ${registered.join(', ') || 'aucun'}${failed.length > 0 ? ` ; déjà pris par une autre app : ${failed.join(', ')}` : ''}`)
}

const BOOT_SIZE = 1

const createWindow = () => {
  win = new BrowserWindow({
    width: BOOT_SIZE,
    height: BOOT_SIZE,
    minWidth: BOOT_SIZE,
    minHeight: BOOT_SIZE,
    frame: false,
    transparent: false,
    hasShadow: false,
    roundedCorners: true,
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
  hasIslandBlur = applyBlur(win, undefined, undefined, ISLAND_TINTS[islandTheme])
  win.setAlwaysOnTop(true, 'floating')
  island = createIsland()
  setInterval(sampleBackdrop, BACKDROP_EVERY_MS)
  island.start()
  guardNavigation(win)
  win.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    releaseHold()
    if (!isMainFrame || code === ERR_ABORTED) return
    island.setOffline(true, OFFLINE_WIDTH, OFFLINE_HEIGHT)
    win.loadURL(OFFLINE_PAGE).catch(() => {})
    setTimeout(loadCockpit, RETRY_MS)
  })
  // Une page rechargée a perdu ses toasts sans le dire : le maintien repart à zéro, la page le reposera s'il en reste un.
  const releaseHold = () => island?.setHeld(false)
  win.webContents.on('did-start-loading', releaseHold)
  win.webContents.on('render-process-gone', releaseHold)
  win.webContents.on('did-finish-load', () => {
    if (!win.webContents.getURL().startsWith(cockpitBase())) return
    win.webContents.send('island-theme', islandTheme)
    island.setOffline(false)
    win.webContents.send('island-state', island.phase())
  })
  win.webContents.session.on('will-download', event => event.preventDefault())
  win.on('closed', () => { island.dispose(); island = null; win = null })
  loadCockpit()
}

let tray = null
const TRAY_SCALE = 2

const toggleIsland = () => {
  if (win === null) return createWindow()
  if (win.isVisible()) island.forceHide()
  else island.event()
}

// Accès clavier : l'île apparaît et le focus va à la pastille.
const showIsland = () => {
  if (win === null) createWindow()
  island.showAndFocus()
}

// Réglage global des sons, gardé dans userData (écriture atomique) et transmis à la page de l'île.
const soundFile = () => path.join(app.getPath('userData'), SOUND_FILE_NAME)
let soundState = { enabled: true, isIntroShown: false }
const areSoundsOn = () => soundState.enabled

const loadSoundSetting = () => {
  if (IS_E2E) { soundState = { enabled: false, isIntroShown: true }; return }
  let raw = null
  try { raw = fs.readFileSync(soundFile(), 'utf8') } catch { raw = null }
  soundState = readSoundState(raw)
}

const saveSoundState = next => {
  soundState = next
  try { writeFileAtomic(soundFile(), serializeSoundState(next)) } catch (error) { logLine(`sons : réglage non enregistré (${error.message})`) }
}

// Une seule voie pour le menu de la barre d'état et le bouton Sons de l'île : écrire, prévenir la page, remettre le menu à jour.
const setSounds = enabled => {
  if (enabled === soundState.enabled) return
  saveSoundState({ ...soundState, enabled })
  win?.webContents.send('sound-setting', enabled)
  refreshTrayMenu()
}

const toggleSounds = () => setSounds(!soundState.enabled)

const toggleAutostart = () => app.setLoginItemSettings({ openAtLogin: !app.getLoginItemSettings().openAtLogin })

// Les mises à jour viennent des releases GitHub, pour l'app installée seulement.
let updater = null

const startUpdates = () => {
  if (!app.isPackaged || IS_E2E) return
  const { autoUpdater } = require('electron-updater')
  updater = createUpdater({ autoUpdater, log: logLine, onChange: () => refreshTrayMenu() })
  updater.start()
}

const readyUpdateVersion = () => {
  const status = updater?.status()
  return status?.phase === 'ready' ? status.version : null
}

const refreshTrayMenu = () => {
  if (tray === null) return
  const actions = { 'install-update': () => updater?.install(), 'open-cockpit': () => openCockpitWindow(null), 'open-browser': openInBrowser, 'install-mod': () => openWizard(SECURE_WEB_PREFERENCES), 'show-island': showIsland, 'toggle-island': toggleIsland, autostart: toggleAutostart, 'toggle-sounds': toggleSounds, quit: () => app.quit() }
  const state = { isIslandVisible: win !== null && win.isVisible(), isAutostart: app.getLoginItemSettings().openAtLogin, areSoundsOn: areSoundsOn(), canOpenInBrowser: embeddedServer !== null, canInstallMod: !isModInstalled(), updateVersion: readyUpdateVersion() }
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

onTrusted('compact-size', (event, width, height) => island?.setCompactSize(Math.round(Number(width)), Math.round(Number(height))))

onTrusted('island-toasts', (event, width, height) => island?.setToasts(Number(width), Number(height)))

onTrusted('expanded', (event, expanded, width, height, byHover, isPassive) => {
  island?.setExpanded(expanded === true, Math.round(Number(width)), Math.round(Number(height)), byHover === true)
  if (expanded === true && isPassive !== true && win !== null) win.focus()
})

onTrusted('island-pointer', (event, isInside) => island?.pointer(isInside === true))

onTrusted('island-event', () => island?.event())

const PIN_KINDS = ['none', 'attention', 'done']

onTrusted('island-pinned', (event, kind) => island?.setPinned(PIN_KINDS.includes(kind) ? kind : 'none'))

onTrusted('island-activity', () => island?.activity())

onTrusted('island-escape', () => island?.escape())

onTrusted('island-hold', (event, isHeld) => island?.setHeld(isHeld === true))
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
handleTrusted('sound-intro', () => introDecision(soundState).shouldShow)
// Mémorisée seulement une fois affichée assez longtemps, pas dès la demande.
onTrusted('sound-intro-seen', () => {
  const { shouldShow, next } = introDecision(soundState)
  if (shouldShow) saveSoundState(next)
})
onTrusted('sound-log', (event, message) => logLine(oneLine(message)))

onTrusted('quit', () => app.quit())

// Le verrou d'instance unique vaut par dossier de données : l'instance de test le prend dans le sien, à côté de l'app installée.
const useTestDataDir = () => {
  const dir = app.commandLine.getSwitchValue('user-data-dir')
  if (dir === '') return false
  app.setPath('userData', dir)
  return true
}

// Le harnais lit l'état de l'app depuis le processus principal (electronApp.evaluate).
const exposeTestProbe = () => {
  globalThis.cockpitE2E = {
    serverPort: () => (embeddedServer === null ? null : serverPort),
    islandPhase: () => island?.phase() ?? null,
    isIslandFocused: () => win !== null && !win.isDestroyed() && win.isFocused(),
    areSoundsOn: () => areSoundsOn(),
    hasGlobalShortcuts: () => activeShortcut !== null || globalShortcut.isRegistered('Control+Alt+I'),
    hasUpdater: () => updater !== null,
  }
}

if (IS_E2E && !useTestDataDir()) {
  console.error('COCKPIT_E2E=1 needs --user-data-dir: the test run never touches the real app data')
  app.exit(1)
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    island?.event()
  })
  app.whenReady().then(async () => {
    if (process.platform === 'darwin') app.dock?.hide()
    nativeTheme.themeSource = 'dark'
    loadSoundSetting()
    if (IS_E2E) exposeTestProbe()
    await startServer()
    createWindow()
    createLauncherWindow()
    if (!IS_E2E) {
      registerLauncherShortcut()
      registerIslandKeys()
    }
    createTray()
    startUpdates()
    registerWizardIpc(refreshTrayMenu)
    if (!IS_E2E && !isModInstalled()) openWizard(SECURE_WEB_PREFERENCES)
  })
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    embeddedServer?.stop()
  })
  app.on('window-all-closed', () => app.quit())
}
