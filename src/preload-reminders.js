// Pont sécurisé pour l'alerte de rappel affichée au centre de l'écran.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gbreminders', {
  getPopup: () => ipcRenderer.invoke('popup:get'),
  dismiss: () => ipcRenderer.invoke('popup:dismiss'),
  snooze: () => ipcRenderer.invoke('popup:snooze'),
});
