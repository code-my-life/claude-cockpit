const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cockpitDesktop', {
  setDockWidth: width => ipcRenderer.send('dock-width', width),
  setExpanded: (expanded, height) => ipcRenderer.send('expanded', expanded, height),
  setClickThrough: enabled => ipcRenderer.send('click-through', enabled),
  openCockpit: () => ipcRenderer.send('open-cockpit'),
  openLink: url => ipcRenderer.send('open-link', url),
  quit: () => ipcRenderer.send('quit'),
})
