const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('helpdesk', {
  invoke: (action, payload) => ipcRenderer.invoke('helpdesk:invoke', { action, payload }),
  selectImage: () => ipcRenderer.invoke('helpdesk:select-image'),
  backup: () => ipcRenderer.invoke('helpdesk:backup'),
  platform: process.platform,
});