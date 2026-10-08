const { app, BrowserWindow, ipcMain, screen, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const COCKPIT_URL = 'http://127.0.0.1:48123/'
const MINI_URL = `${COCKPIT_URL}?mini=1`
const RETRY_MS = 5000
const ERR_ABORTED = -3
const MARGIN = 12
const DOCK_MIN_WIDTH = 120
const DOCK_HEIGHT = 170
const EXPANDED_MAX_WIDTH = 1100
const EXPANDED_MAX_HEIGHT = 800
const SELF_MOVE_GRACE_MS = 600
const OFFLINE_PAGE = `data:text/html;charset=utf-8,${encodeURIComponent('<body style="margin:0;background:transparent;font-family:system-ui;display:flex;align-items:flex-end;justify-content:flex-end;height:100vh"><div style="margin:0 8px 8px 0;padding:10px 16px;border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 6px 20px rgba(0,0,0,.18);font-size:13px;color:#6B6F7A">💤 Cockpit éteint : ouvre une conversation Claude</div></body>')}`

let win = null
let dockWidth = DOCK_MIN_WIDTH
let isExpanded = false
let expandedHeight = EXPANDED_MAX_HEIGHT
let anchor = null
let selfMovedAt = 0

const anchorFile = () => path.join(app.getPath('userData'), 'anchor.json')

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
  const width = isExpanded ? Math.min(EXPANDED_MAX_WIDTH, area.width - 2 * MARGIN) : Math.max(DOCK_MIN_WIDTH, dockWidth)
  const height = isExpanded ? Math.min(expandedHeight, EXPANDED_MAX_HEIGHT, area.height - 2 * MARGIN) : DOCK_HEIGHT
  const x = isExpanded ? Math.round(area.x + (area.width - width) / 2) : Math.max(area.x, target.right - width)
  const y = isExpanded ? Math.round(area.y + (area.height - height) / 2) : Math.max(area.y, target.bottom - height)
  selfMovedAt = Date.now()
  win.setBounds({ x, y, width, height })
}

const rememberAnchor = () => {
  if (win === null || isExpanded || Date.now() - selfMovedAt < SELF_MOVE_GRACE_MS) return
  const bounds = win.getBounds()
  anchor = { right: bounds.x + bounds.width, bottom: bounds.y + bounds.height }
  saveAnchor()
}

const loadCockpit = () => {
  if (win === null) return
  win.loadURL(MINI_URL).catch(() => {})
}

const openOutside = url => {
  if (/^(https?|claude):/.test(url)) shell.openExternal(url)
}

const createWindow = () => {
  anchor = loadAnchor()
  win = new BrowserWindow({
    width: DOCK_MIN_WIDTH,
    height: DOCK_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  win.setAlwaysOnTop(true, 'floating')
  win.setIgnoreMouseEvents(true, { forward: true })
  applyBounds()

  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(COCKPIT_URL)) return
    event.preventDefault()
    openOutside(url)
  })
  win.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === ERR_ABORTED) return
    isExpanded = false
    dockWidth = 360
    applyBounds()
    win.loadURL(OFFLINE_PAGE).catch(() => {})
    setTimeout(loadCockpit, RETRY_MS)
  })
  win.webContents.session.on('will-download', event => event.preventDefault())
  win.on('moved', rememberAnchor)
  win.on('closed', () => { win = null })
  loadCockpit()
}

ipcMain.on('dock-width', (event, width) => {
  dockWidth = Math.round(Number(width) || DOCK_MIN_WIDTH)
  if (!isExpanded) applyBounds()
})

ipcMain.on('expanded', (event, expanded, height) => {
  isExpanded = expanded === true
  expandedHeight = Math.max(DOCK_HEIGHT, Math.round(Number(height) || EXPANDED_MAX_HEIGHT))
  applyBounds()
  if (isExpanded && win !== null) win.focus()
})

ipcMain.on('click-through', (event, enabled) => {
  if (win === null) return
  if (enabled === true && !isExpanded) win.setIgnoreMouseEvents(true, { forward: true })
  else win.setIgnoreMouseEvents(false)
})

ipcMain.on('open-cockpit', () => shell.openExternal(COCKPIT_URL))

ipcMain.on('open-link', (event, url) => openOutside(String(url)))

ipcMain.on('quit', () => app.quit())

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    isExpanded = false
    applyBounds()
    if (win !== null) win.showInactive()
  })
  app.whenReady().then(createWindow)
  app.on('window-all-closed', () => app.quit())
}
