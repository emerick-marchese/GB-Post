// Pont sécurisé entre la fenêtre d'un post-it et le processus principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gbpost', {
  getNote: () => ipcRenderer.invoke('note:get'),
  update: (patch) => ipcRenderer.invoke('note:update', patch),
  togglePin: () => ipcRenderer.invoke('note:toggle-pin'),
  createNote: () => ipcRenderer.invoke('note:create'),
  deleteNote: () => ipcRenderer.invoke('note:delete'),
  hideNote: () => ipcRenderer.invoke('note:hide'),
  resize: (width, height) => ipcRenderer.invoke('note:resize', width, height),
  openApp: () => ipcRenderer.invoke('note:open-app'),
  // Changements faits depuis la fenêtre principale (couleur, épinglage…).
  onChanged: (cb) => ipcRenderer.on('note:changed', (_e, note) => cb(note)),
});
