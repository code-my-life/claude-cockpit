const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cockpitDesktop', {
  setDockSize: (width, height) => ipcRenderer.send('dock-size', width, height),
  setExpanded: (expanded, width, height) => ipcRenderer.send('expanded', expanded, width, height),
  islandPointer: isInside => ipcRenderer.send('island-pointer', isInside),
  islandEvent: () => ipcRenderer.send('island-event'),
  islandPinned: isPinned => ipcRenderer.send('island-pinned', isPinned),
  islandActivity: () => ipcRenderer.send('island-activity'),
  islandEscape: () => ipcRenderer.send('island-escape'),
  islandMotion: isReduced => ipcRenderer.send('island-motion', isReduced),
  onIslandState: callback => ipcRenderer.on('island-state', (event, phase) => callback(phase)),
  openCockpit: section => ipcRenderer.send('open-cockpit', section),
  openLink: url => ipcRenderer.send('open-link', url),
  quit: () => ipcRenderer.send('quit'),
  setLauncherHeight: height => ipcRenderer.send('launcher-height', height),
  hideLauncher: () => ipcRenderer.send('launcher-hide'),
  onLauncherShown: callback => ipcRenderer.on('launcher-shown', () => callback()),
  launcherShortcut: () => ipcRenderer.invoke('launcher-shortcut'),
})
