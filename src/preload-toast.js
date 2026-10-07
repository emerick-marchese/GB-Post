// Pont sécurisé pour la notification "nouveau ticket GBDESK".
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gbtoast', {
  get: () => ipcRenderer.invoke('toast:get'),
  close: () => ipcRenderer.invoke('toast:close'),
  open: () => ipcRenderer.invoke('toast:open'),
});
