const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, nativeTheme, screen, session, shell } = require('electron')
const crypto = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')
const { boundsOf, MARGIN, SHEET_MAX_HEIGHT } = require('./bounds')
const { applyBlur } = require('./blur')
const { launcherBoundsOf, LAUNCHER_WIDTH, LAUNCHER_MIN_HEIGHT } = require('./launcher')
const { startEmbeddedServer } = require('./embedded-server')
const { trayIconBitmap, trayMenuOf, TRAY_ICON_SIZE } = require('./tray-model')

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
const miniUrl = () => `${cockpitBase()}?mini=1${glassParam()}`
const cockpitUrl = () => (hasOsBlur ? `${cockpitBase()}?glass=1` : cockpitBase())
const launcherUrl = () => `${cockpitBase()}?launcher=1${glassParam()}`
const LAUNCHER_SHORTCUTS = process.platform === 'darwin' ? ['Command+Alt+Space', 'Control+Alt+Space'] : ['Alt+Space', 'Control+Alt+Space']
const RETRY_MS = 5000
const ERR_ABORTED = -3
const DOCK_MIN_WIDTH = 120
const DOCK_HEIGHT = 96
const OFFLINE_WIDTH = 380
const OFFLINE_HEIGHT = 44
const SELF_MOVE_GRACE_MS = 600
const COCKPIT_WIDTH = 1180
const COCKPIT_HEIGHT = 900
const CLEAR = '#00000000'
const TITLE_SYMBOLS = '#ecece6'
const TITLE_BAR_HEIGHT = 36
const SECURE_WEB_PREFERENCES = { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
const OFFLINE_PAGE = `data:text/html;charset=utf-8,${encodeURIComponent('<body style="margin:0;background:transparent;height:100vh;display:flex;align-items:center;justify-content:center;font:500 11px/1 Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:#a5a8ae">Cockpit éteint : ouvre une conversation Claude</body>')}`

let win = null
let cockpitWin = null
let launcherWin = null
let launcherHeight = LAUNCHER_MIN_HEIGHT
let isLauncherBroken = false
let activeShortcut = null
let dockWidth = DOCK_MIN_WIDTH
let dockHeight = DOCK_HEIGHT
let isExpanded = false
let sheetWidth = 0
let sheetHeight = SHEET_MAX_HEIGHT
let anchor = null
let selfMovedAt = 0

const anchorFile = () => path.join(app.getPath('userData'), 'anchor.json')

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

const loadAnchor = () => {
  try {
    const saved = JSON.parse(fs.readFileSync(anchorFile(), 'utf8'))
    const isOnScreen = screen.getAllDisplays().some(display => {
      const area = display.workArea
      return saved.right > area.x && saved.right <= area.x + area.width && saved.bottom > area.y && saved.bottom <= area.y + area.height
    })
    return isOnScreen ? saved : null
  } catch {
    return null
  }
}

const saveAnchor = () => {
  try { fs.writeFileSync(anchorFile(), JSON.stringify(anchor)) } catch { }
}

const workArea = () => screen.getPrimaryDisplay().workArea

const defaultAnchor = () => {
  const area = workArea()
  return { right: area.x + area.width - MARGIN, bottom: area.y + area.height - MARGIN }
}

const dockArea = target => screen.getDisplayNearestPoint({ x: target.right - 1, y: target.bottom - 1 }).workArea

const applyBounds = () => {
  if (win === null) return
  const target = anchor ?? defaultAnchor()
  const area = dockArea(target)
  const bounds = boundsOf(target, area, { isExpanded, dockWidth, dockHeight, sheetWidth, sheetHeight })
  selfMovedAt = Date.now()
  win.setBounds(bounds)
}

const rememberAnchor = () => {
  if (win === null || isExpanded || Date.now() - selfMovedAt < SELF_MOVE_GRACE_MS) return
  const bounds = win.getBounds()
  anchor = { right: bounds.x + bounds.width, bottom: bounds.y + bounds.height }
  saveAnchor()
}

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

const createWindow = () => {
  anchor = loadAnchor()
  win = new BrowserWindow({
    width: DOCK_MIN_WIDTH,
    height: DOCK_HEIGHT,
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
  hasOsBlur = applyBlur(win)
  win.setAlwaysOnTop(true, 'floating')
  applyBounds()
  guardNavigation(win)
  win.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === ERR_ABORTED) return
    isExpanded = false
    dockWidth = OFFLINE_WIDTH
    dockHeight = OFFLINE_HEIGHT
    applyBounds()
    win.loadURL(OFFLINE_PAGE).catch(() => {})
    setTimeout(loadCockpit, RETRY_MS)
  })
  win.webContents.session.on('will-download', event => event.preventDefault())
  win.on('moved', rememberAnchor)
  win.on('closed', () => { win = null })
  loadCockpit()
}

let tray = null
const TRAY_SCALE = 2

const toggleDock = () => {
  if (win === null) return createWindow()
  if (win.isVisible()) win.hide()
  else win.showInactive()
}

const toggleAutostart = () => app.setLoginItemSettings({ openAtLogin: !app.getLoginItemSettings().openAtLogin })

const refreshTrayMenu = () => {
  if (tray === null) return
  const actions = { 'open-cockpit': () => openCockpitWindow(null), 'open-browser': openInBrowser, 'toggle-dock': toggleDock, autostart: toggleAutostart, quit: () => app.quit() }
  const state = { isDockVisible: win !== null && win.isVisible(), isAutostart: app.getLoginItemSettings().openAtLogin, canOpenInBrowser: embeddedServer !== null }
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

onTrusted('dock-size', (event, width, height) => {
  dockWidth = Math.round(Number(width) || DOCK_MIN_WIDTH)
  dockHeight = Math.round(Number(height) || DOCK_HEIGHT)
  if (!isExpanded) applyBounds()
})

onTrusted('expanded', (event, expanded, width, height) => {
  isExpanded = expanded === true
  sheetWidth = Math.round(Number(width) || 0)
  sheetHeight = Math.round(Number(height) || SHEET_MAX_HEIGHT)
  applyBounds()
  if (isExpanded && win !== null) win.focus()
})

onTrusted('open-cockpit', (event, section) => openCockpitWindow(section === 'search' ? 'search' : null))

onTrusted('open-link', (event, url) => openOutside(String(url)))

onTrusted('launcher-height', (event, height) => {
  launcherHeight = Math.round(Number(height) || LAUNCHER_MIN_HEIGHT)
  if (launcherWin !== null && launcherWin.isVisible()) placeLauncher()
})

onTrusted('launcher-hide', hideLauncher)

handleTrusted('launcher-shortcut', () => activeShortcut)

onTrusted('quit', () => app.quit())

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    isExpanded = false
    applyBounds()
    if (win !== null) win.showInactive()
  })
  app.whenReady().then(async () => {
    if (process.platform === 'darwin') app.dock?.hide()
    nativeTheme.themeSource = 'dark'
    await startServer()
    createWindow()
    createLauncherWindow()
    registerLauncherShortcut()
    createTray()
  })
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    embeddedServer?.stop()
  })
  app.on('window-all-closed', () => app.quit())
}
