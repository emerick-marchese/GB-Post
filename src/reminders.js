// Rappels : alarmes, minuteurs et chronomètre, gérés par le processus principal
// pour continuer à tourner même quand la fenêtre de GB Post est fermée.
// Quand c'est l'heure, une alerte animée (sans son) s'affiche au centre de l'écran.
const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const crypto = require('crypto');

const ASSETS = path.join(__dirname, '..', 'assets');
const SNOOZE_MINUTES = 5;
// Une alarme manquée de plus de 12 h (PC éteint) n'est plus affichée, juste reprogrammée.
const MAX_LATE_MS = 12 * 60 * 60 * 1000;
const POPUP_SIZE = { width: 480, height: 360 };

let store;
let onChange = () => {};
const popups = new Map(); // webContents.id -> { win, reminder }

function newId() {
  return crypto.randomUUID();
}

// ---------- Calcul des alarmes ----------

// Prochaine occurrence de l'alarme après "from". days : jours de la semaine
// (0 = dimanche … 6 = samedi) ; vide = une seule fois.
function nextOccurrence(alarm, from = Date.now()) {
  const [h, m] = alarm.time.split(':').map(Number);
  const base = new Date(from);
  for (let d = 0; d <= 7; d++) {
    const c = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d, h, m, 0, 0);
    if (c.getTime() <= from) continue;
    if (!alarm.days?.length || alarm.days.includes(c.getDay())) return c.getTime();
  }
  return null;
}

function schedule(alarm) {
  alarm.nextAt = alarm.enabled ? nextOccurrence(alarm) : null;
}

// ---------- État partagé avec la fenêtre "Rappels" ----------

function state() {
  return {
    alarms: store.data.alarms,
    timers: store.data.timers,
    stopwatch: store.data.stopwatch,
    now: Date.now(),
  };
}

function changed() {
  store.save();
  onChange(state());
}

// ---------- Alerte au centre de l'écran ----------

function showPopup(reminder) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { workArea } = display;
  const offset = popups.size * 30; // plusieurs alertes en même temps : léger décalage
  const win = new BrowserWindow({
    width: POPUP_SIZE.width,
    height: POPUP_SIZE.height,
    x: Math.round(workArea.x + (workArea.width - POPUP_SIZE.width) / 2 + offset),
    y: Math.round(workArea.y + (workArea.height - POPUP_SIZE.height) / 2 + offset),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: false,
    title: 'GB Post - Rappel',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-reminders.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  popups.set(win.webContents.id, { win, reminder });
  win.loadFile(path.join(__dirname, 'popup.html'));
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
  win.on('closed', () => {
    for (const [key, p] of popups) if (p.win === win) popups.delete(key);
  });
}

// ---------- Boucle de vérification ----------

function tick() {
  const now = Date.now();
  let dirty = false;

  for (const alarm of store.data.alarms) {
    if (!alarm.enabled) continue;
    if (!alarm.nextAt) { schedule(alarm); dirty = true; continue; }
    if (alarm.nextAt > now) continue;
    if (now - alarm.nextAt < MAX_LATE_MS) {
      showPopup({ kind: 'alarm', label: alarm.label, at: alarm.nextAt });
    }
    if (!alarm.days?.length) alarm.enabled = false; // alarme unique : on la désactive
    schedule(alarm);
    dirty = true;
  }

  const finished = store.data.timers.filter((t) => t.running && t.endsAt <= now);
  for (const timer of finished) {
    showPopup({ kind: timer.snooze ? 'snooze' : 'timer', label: timer.label, at: timer.endsAt, durationMs: timer.durationMs });
  }
  if (finished.length) {
    store.data.timers = store.data.timers.filter((t) => !finished.includes(t));
    dirty = true;
  }

  if (dirty) changed();
}

// ---------- Communication ----------

function str(v, max = 200) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function registerIpc() {
  ipcMain.handle('reminders:get', () => state());

  // Alarmes
  ipcMain.handle('alarm:save', (_e, input) => {
    if (!input || !/^\d{2}:\d{2}$/.test(input.time)) return state();
    const days = Array.isArray(input.days)
      ? [...new Set(input.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
      : [];
    let alarm = store.data.alarms.find((a) => a.id === input.id);
    if (!alarm) {
      alarm = { id: newId(), createdAt: Date.now() };
      store.data.alarms.push(alarm);
    }
    Object.assign(alarm, { time: input.time, label: str(input.label), days, enabled: true });
    schedule(alarm);
    store.data.alarms.sort((a, b) => a.time.localeCompare(b.time));
    changed();
    return state();
  });
  ipcMain.handle('alarm:toggle', (_e, id) => {
    const alarm = store.data.alarms.find((a) => a.id === id);
    if (alarm) {
      alarm.enabled = !alarm.enabled;
      schedule(alarm);
      changed();
    }
    return state();
  });
  ipcMain.handle('alarm:delete', (_e, id) => {
    store.data.alarms = store.data.alarms.filter((a) => a.id !== id);
    changed();
    return state();
  });

  // Minuteurs
  ipcMain.handle('timer:start', (_e, input) => {
    const durationMs = Number(input?.durationMs);
    if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 100 * 3600e3) return state();
    store.data.timers.push({
      id: newId(),
      label: str(input.label),
      durationMs,
      running: true,
      endsAt: Date.now() + durationMs,
      remainingMs: durationMs,
    });
    changed();
    return state();
  });
  ipcMain.handle('timer:pause', (_e, id) => {
    const t = store.data.timers.find((x) => x.id === id);
    if (t?.running) {
      t.running = false;
      t.remainingMs = Math.max(0, t.endsAt - Date.now());
      t.endsAt = null;
      changed();
    }
    return state();
  });
  ipcMain.handle('timer:resume', (_e, id) => {
    const t = store.data.timers.find((x) => x.id === id);
    if (t && !t.running) {
      t.running = true;
      t.endsAt = Date.now() + t.remainingMs;
      changed();
    }
    return state();
  });
  ipcMain.handle('timer:cancel', (_e, id) => {
    store.data.timers = store.data.timers.filter((t) => t.id !== id);
    changed();
    return state();
  });

  // Chronomètre
  const sw = () => store.data.stopwatch;
  const swElapsed = () => sw().elapsedMs + (sw().running ? Date.now() - sw().startedAt : 0);
  ipcMain.handle('stopwatch:start', () => {
    if (!sw().running) Object.assign(sw(), { running: true, startedAt: Date.now() });
    changed();
    return state();
  });
  ipcMain.handle('stopwatch:pause', () => {
    if (sw().running) Object.assign(sw(), { running: false, elapsedMs: swElapsed(), startedAt: null });
    changed();
    return state();
  });
  ipcMain.handle('stopwatch:lap', () => {
    if (sw().running) sw().laps.unshift(swElapsed());
    changed();
    return state();
  });
  ipcMain.handle('stopwatch:reset', () => {
    Object.assign(sw(), { running: false, startedAt: null, elapsedMs: 0, laps: [] });
    changed();
    return state();
  });

  // Alerte
  ipcMain.handle('popup:get', (e) => popups.get(e.sender.id)?.reminder || null);
  ipcMain.handle('popup:dismiss', (e) => {
    popups.get(e.sender.id)?.win.close();
  });
  ipcMain.handle('popup:snooze', (e) => {
    const p = popups.get(e.sender.id);
    if (!p) return;
    const durationMs = SNOOZE_MINUTES * 60e3;
    store.data.timers.push({
      id: newId(),
      label: p.reminder.label,
      durationMs,
      running: true,
      snooze: true,
      endsAt: Date.now() + durationMs,
      remainingMs: durationMs,
    });
    changed();
    p.win.close();
  });
}

// listener : appelé avec le nouvel état à chaque changement (pour la fenêtre principale).
function initReminders(s, listener) {
  store = s;
  if (listener) onChange = listener;
  for (const alarm of store.data.alarms) {
    // Alarme dépassée pendant que l'app était fermée : on garde l'heure prévue
    // pour l'afficher au prochain tick si le retard est raisonnable.
    if (alarm.enabled && !alarm.nextAt) schedule(alarm);
  }
  registerIpc();
  tick();
  setInterval(tick, 1000);
}

module.exports = { initReminders, getRemindersState: state, showPopup };
