// Pont sécurisé pour la fenêtre principale de GB Post.
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const listen = (channel) => (cb) => ipcRenderer.on(channel, (_e, value) => cb(value));

contextBridge.exposeInMainWorld('gbapp', {
  onView: listen('app:view'),

  // Post-its
  getNotes: call('app:notes'),
  onNotes: listen('app:notes'),
  createNote: call('app:note-create'),
  openNote: call('app:note-open'),
  setNote: call('app:note-set'),
  deleteNote: call('app:note-delete'),
  showAllNotes: call('app:notes-show-all'),
  hideAllNotes: call('app:notes-hide-all'),

  // Réglages
  getSettings: call('app:settings'),
  onSettings: listen('app:settings'),
  setAutoStart: call('app:set-autostart'),

  // Mises à jour
  getUpdateStatus: call('app:update-status'),
  onUpdate: listen('app:update'),
  checkForUpdates: call('app:update-check'),
  installUpdate: call('app:update-install'),
});

contextBridge.exposeInMainWorld('gbreminders', {
  getState: call('reminders:get'),
  onState: listen('reminders:state'),

  saveAlarm: call('alarm:save'),
  toggleAlarm: call('alarm:toggle'),
  deleteAlarm: call('alarm:delete'),

  startTimer: call('timer:start'),
  pauseTimer: call('timer:pause'),
  resumeTimer: call('timer:resume'),
  cancelTimer: call('timer:cancel'),

  startStopwatch: call('stopwatch:start'),
  pauseStopwatch: call('stopwatch:pause'),
  lapStopwatch: call('stopwatch:lap'),
  resetStopwatch: call('stopwatch:reset'),
});
