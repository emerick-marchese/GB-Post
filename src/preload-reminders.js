// Pont sécurisé pour la fenêtre "Rappels" et les alertes.
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('gbreminders', {
  getState: call('reminders:get'),
  onState: (cb) => ipcRenderer.on('reminders:state', (_e, s) => cb(s)),
  onTab: (cb) => ipcRenderer.on('reminders:tab', (_e, tab) => cb(tab)),

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

  getPopup: call('popup:get'),
  dismiss: call('popup:dismiss'),
  snooze: call('popup:snooze'),
});
