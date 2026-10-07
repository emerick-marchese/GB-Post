// Pont sécurisé entre la fenêtre d'un post-it et le processus principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gbpost', {
  getNote: () => ipcRenderer.invoke('note:get'),
  update: (patch) => ipcRenderer.invoke('note:update', patch),
  togglePin: () => ipcRenderer.invoke('note:toggle-pin'),
  createNote: () => ipcRenderer.invoke('note:create'),
  deleteNote: () => ipcRenderer.invoke('note:delete'),
});
