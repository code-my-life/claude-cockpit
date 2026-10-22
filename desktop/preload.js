const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cockpitDesktop', {
  // Échelle de la morphose (1 sauf mise au point, posée par le lanceur) : la page cale ses fondus dessus.
  motionScale: Number(process.env.COCKPIT_ISLAND_SLOW) || 1,
  setCompactSize: (width, height) => ipcRenderer.send('compact-size', width, height),
  setExpanded: (expanded, width, height, byHover, isPassive, isInstant) => ipcRenderer.send('expanded', expanded, width, height, byHover === true, isPassive === true, isInstant === true),
  setToasts: (width, height) => ipcRenderer.send('island-toasts', width, height),
  islandPointer: isInside => ipcRenderer.send('island-pointer', isInside),
  // The glass window's morph, in the content window's coordinates: { from, to, ms, zeta, startedAt }.
  onIslandGeometry: callback => ipcRenderer.on('island-geometry', (event, geometry) => callback(geometry)),
  // Said once the page can draw the shape (island-geometry): the app then splits the content window from the glass.
  islandSplit: () => ipcRenderer.send('island-split'),
  islandEvent: () => ipcRenderer.send('island-event'),
  islandPinned: isPinned => ipcRenderer.send('island-pinned', isPinned),
  islandActivity: () => ipcRenderer.send('island-activity'),
  islandEscape: () => ipcRenderer.send('island-escape'),
  islandHold: isHeld => ipcRenderer.send('island-hold', isHeld),
  islandMotion: isReduced => ipcRenderer.send('island-motion', isReduced),
  onIslandState: callback => ipcRenderer.on('island-state', (event, phase, cause) => callback(phase, cause)),
  onIslandFocus: callback => ipcRenderer.on('island-focus', () => callback()),
  // The cursor left the island shape: once the window lets clicks through, the page gets no mouseleave.
  onIslandPointerOut: callback => ipcRenderer.on('island-pointer-out', () => callback()),
  onIslandCommand: callback => ipcRenderer.on('island-command', (event, action) => callback(String(action))),
  onPermissionsChanged: callback => ipcRenderer.on('permissions-changed', (event, count) => callback(Number(count) || 0)),
  onIslandTheme: callback => ipcRenderer.on('island-theme', (event, theme) => callback(theme)),
  openCockpit: (section, query) => ipcRenderer.send('open-cockpit', section, query),
  openLink: url => ipcRenderer.send('open-link', url),
  quit: () => ipcRenderer.send('quit'),
  setLauncherHeight: height => ipcRenderer.send('launcher-height', height),
  hideLauncher: () => ipcRenderer.send('launcher-hide'),
  onLauncherShown: callback => ipcRenderer.on('launcher-shown', () => callback()),
  launcherShortcut: () => ipcRenderer.invoke('launcher-shortcut'),
  soundSetting: () => ipcRenderer.invoke('sound-setting'),
  setSounds: isEnabled => ipcRenderer.send('set-sound', isEnabled),
  soundSilent: () => ipcRenderer.invoke('sound-silent'),
  soundIntro: () => ipcRenderer.invoke('sound-intro'),
  soundIntroSeen: () => ipcRenderer.send('sound-intro-seen'),
  logSound: message => ipcRenderer.send('sound-log', message),
  onSoundSetting: callback => ipcRenderer.on('sound-setting', (event, isEnabled) => callback(isEnabled)),
})
