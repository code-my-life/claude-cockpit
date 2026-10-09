const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cockpitDesktop', {
  setDockSize: (width, height) => ipcRenderer.send('dock-size', width, height),
  setExpanded: (expanded, width, height) => ipcRenderer.send('expanded', expanded, width, height),
  openCockpit: section => ipcRenderer.send('open-cockpit', section),
  openLink: url => ipcRenderer.send('open-link', url),
  quit: () => ipcRenderer.send('quit'),
  setLauncherHeight: height => ipcRenderer.send('launcher-height', height),
  hideLauncher: () => ipcRenderer.send('launcher-hide'),
  onLauncherShown: callback => ipcRenderer.on('launcher-shown', () => callback()),
  launcherShortcut: () => ipcRenderer.invoke('launcher-shortcut'),
})
