const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cockpitWizard', {
  plan: () => ipcRenderer.invoke('wizard-plan'),
  apply: options => ipcRenderer.invoke('wizard-apply', options),
  close: () => ipcRenderer.send('wizard-close'),
})
