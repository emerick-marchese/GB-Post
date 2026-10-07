// GB Post - processus principal Electron.
// - Une fenêtre principale pour gérer les post-its, les rappels et les réglages.
// - Chaque post-it est une petite fenêtre sans bordure posée sur le bureau.
// - L'app reste active dans la zone de notification et se lance au démarrage.
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Store = require('./store');
const { initReminders } = require('./reminders');

const APP_NAME = 'GB Post';
const ASSETS = path.join(__dirname, '..', 'assets');
const DEFAULT_COLOR = '#fff176';
const DEFAULT_SIZE = { width: 280, height: 300 };

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('com.gbpost.app');

// Argument ajouté au lancement automatique : on démarre discrètement, sans la
// fenêtre principale (seulement les post-its sur le bureau).
const AUTOSTART_ARG = '--autostart';

// Une seule instance : relancer l'app ouvre simplement la fenêtre principale.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let store;
let tray = null;
let mainWin = null;
let quitting = false;
const windows = new Map(); // id du post-it -> BrowserWindow

// ---------- Lancement au démarrage ----------

function linuxAutostartFile() {
  return path.join(app.getPath('home'), '.config', 'autostart', 'gb-post.desktop');
}

function launchCommand() {
  // En mode développement on relance "electron <dossier de l'app>".
  if (app.isPackaged) return [process.env.APPIMAGE || process.execPath];
  return [process.execPath, app.getAppPath()];
}

function applyAutoStart(enabled) {
  if (process.platform === 'linux') {
    const file = linuxAutostartFile();
    if (enabled) {
      const exec = launchCommand().map((p) => `"${p}"`).join(' ');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, [
        '[Desktop Entry]',
        'Type=Application',
        `Name=${APP_NAME}`,
        `Exec=${exec} ${AUTOSTART_ARG}`,
        ...(app.isPackaged ? [] : [`Icon=${path.join(ASSETS, 'icon.png')}`]),
        'X-GNOME-Autostart-enabled=true',
        'Terminal=false',
        '',
      ].join('\n'));
    } else if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
    return;
  }
  const [exe, ...args] = launchCommand();
  app.setLoginItemSettings({ openAtLogin: enabled, path: exe, args: [...args, AUTOSTART_ARG] });
}

// ---------- Fenêtres des post-its ----------

function newId() {
  return crypto.randomUUID();
}

// Remet un post-it sur un écran visible s'il a été laissé sur un écran débranché.
function visibleBounds(note) {
  const bounds = {
    x: note.x, y: note.y,
    width: note.width || DEFAULT_SIZE.width,
    height: note.height || DEFAULT_SIZE.height,
  };
  if (typeof bounds.x !== 'number' || typeof bounds.y !== 'number') {
    const { workArea } = screen.getPrimaryDisplay();
    bounds.x = Math.round(workArea.x + workArea.width - bounds.width - 40);
    bounds.y = Math.round(workArea.y + 40);
    return bounds;
  }
  const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
    bounds.x + 40 > a.x && bounds.x < a.x + a.width - 40 &&
    bounds.y >= a.y - 10 && bounds.y < a.y + a.height - 40);
  if (!onScreen) {
    const { workArea } = screen.getPrimaryDisplay();
    bounds.x = workArea.x + 60;
    bounds.y = workArea.y + 60;
  }
  return bounds;
}

// Anciennes notes (texte + checklist séparés) -> liste de blocs mélangés.
function migrateNote(note) {
  if (Array.isArray(note.blocks)) return;
  const blocks = [];
  if (note.text) blocks.push({ id: newId(), type: 'text', text: note.text });
  for (const item of note.checklist || []) {
    blocks.push({ id: item.id || newId(), type: 'check', text: item.text || '', done: !!item.done });
  }
  if (blocks.length === 0) blocks.push({ id: newId(), type: 'text', text: '' });
  note.blocks = blocks;
  delete note.text;
  delete note.checklist;
  note.pinned = false;
  store.save();
}

function openNoteWindow(note) {
  const bounds = visibleBounds(note);
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 180,
    minHeight: 140,
    frame: false,
    show: false,
    skipTaskbar: true,
    // Un post-it épinglé est figé sur le bureau : ni déplaçable ni redimensionnable.
    movable: !note.pinned,
    resizable: !note.pinned,
    backgroundColor: note.color || DEFAULT_COLOR,
    title: APP_NAME,
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windows.set(note.id, win);

  win.loadFile(path.join(__dirname, 'note.html'), { query: { id: note.id } });
  win.once('ready-to-show', () => win.showInactive());

  const saveBounds = () => {
    if (win.isDestroyed()) return;
    const b = win.getBounds();
    store.updateNote(note.id, { x: b.x, y: b.y, width: b.width, height: b.height }, false);
  };
  win.on('moved', saveBounds);
  win.on('resized', saveBounds);
  // "move"/"resize" couvrent les plateformes où "moved"/"resized" n'existent pas.
  win.on('move', saveBounds);
  win.on('resize', saveBounds);

  win.on('closed', () => windows.delete(note.id));
  return win;
}

function createNote(near) {
  const note = {
    id: newId(),
    color: DEFAULT_COLOR,
    blocks: [{ id: newId(), type: 'text', text: '' }],
    pinned: false,
    width: DEFAULT_SIZE.width,
    height: DEFAULT_SIZE.height,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  if (near) {
    note.x = near.x + 30;
    note.y = near.y + 30;
    note.color = near.color || DEFAULT_COLOR;
  }
  store.addNote(note);
  const win = openNoteWindow(note);
  win.once('ready-to-show', () => win.focus());
  notesChanged();
  return note;
}

function showAllNotes() {
  for (const note of store.notes) {
    if (note.hidden) setNoteProps(note.id, { hidden: false });
  }
  for (const win of windows.values()) {
    if (win.isMinimized()) win.restore();
    win.showInactive();
    win.moveTop();
  }
}

function hideAllNotes() {
  for (const note of store.notes) setNoteProps(note.id, { hidden: true });
}

// Change couleur / épinglage / visibilité d'un post-it et met à jour sa fenêtre.
function setNoteProps(id, props) {
  const note = store.getNote(id);
  if (!note) return null;
  const patch = {};
  if (typeof props.color === 'string' && /^#[0-9a-f]{6}$/i.test(props.color)) patch.color = props.color;
  if (typeof props.pinned === 'boolean') patch.pinned = props.pinned;
  if (typeof props.hidden === 'boolean') patch.hidden = props.hidden;
  store.updateNote(id, patch, 'color' in patch);

  let win = windows.get(id);
  if (patch.hidden === true && win) {
    win.destroy();
    win = null;
  } else if (patch.hidden === false && !win) {
    win = openNoteWindow(note);
  }
  if (win && !win.isDestroyed()) {
    if (patch.color) win.setBackgroundColor(patch.color);
    if ('pinned' in patch) {
      win.setMovable(!patch.pinned);
      win.setResizable(!patch.pinned);
    }
    win.webContents.send('note:changed', note);
  }
  notesChanged();
  return note;
}

// Met le post-it au premier plan sur le bureau, prêt à être modifié.
function openNoteForEdit(id) {
  const note = store.getNote(id);
  if (!note) return;
  if (note.hidden || note.pinned) setNoteProps(id, { hidden: false, pinned: false });
  const win = windows.get(id);
  if (!win) return;
  const focus = () => {
    if (win.isMinimized()) win.restore();
    win.show();
    win.moveTop();
    win.focus();
  };
  if (win.webContents.isLoading()) win.once('ready-to-show', focus); else focus();
}

async function confirmDelete(id, parent) {
  const note = store.getNote(id);
  if (!note) return false;
  const isEmpty = !(note.blocks || []).some((b) => b.text?.trim());
  if (!isEmpty) {
    const { response } = await dialog.showMessageBox(parent, {
      type: 'question',
      buttons: ['Supprimer', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
      title: APP_NAME,
      message: 'Supprimer ce post-it ?',
      detail: 'Son contenu sera définitivement perdu.',
    });
    if (response !== 0) return false;
  }
  store.removeNote(id);
  windows.get(id)?.destroy();
  notesChanged();
  return true;
}

// ---------- Fenêtre principale ----------

function sendToMain(channel, payload) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, payload);
}

function notesChanged() {
  sendToMain('app:notes', store.notes);
}

function openMainWindow(view) {
  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
    if (view) sendToMain('app:view', view);
    return;
  }
  mainWin = new BrowserWindow({
    width: 1000,
    height: 680,
    minWidth: 760,
    minHeight: 500,
    show: false,
    title: APP_NAME,
    autoHideMenuBar: true,
    backgroundColor: '#fffdf2',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-app.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWin.setMenu(null);
  mainWin.loadFile(path.join(__dirname, 'app.html'), { query: view ? { view } : {} });
  mainWin.once('ready-to-show', () => mainWin.show());
  // Fermer la fenêtre ne quitte pas l'app : elle reste dans la zone de notification.
  mainWin.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWin.hide();
    }
  });
  mainWin.on('closed', () => { mainWin = null; });
}

// ---------- Zone de notification ----------

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: `Ouvrir ${APP_NAME}`, click: () => openMainWindow() },
    { type: 'separator' },
    { label: 'Nouveau post-it', click: () => createNote() },
    { label: 'Afficher tous les post-its', click: showAllNotes },
    { type: 'separator' },
    { label: '⏰ Alarmes', click: () => openMainWindow('alarm') },
    { label: '⏳ Minuteurs', click: () => openMainWindow('timer') },
    { label: '⏱ Chronomètre', click: () => openMainWindow('stopwatch') },
    { type: 'separator' },
    {
      label: 'Lancer au démarrage',
      type: 'checkbox',
      checked: !!store.settings.autoStart,
      click: (item) => setAutoStart(item.checked),
    },
    { type: 'separator' },
    { label: `Quitter ${APP_NAME}`, click: () => app.quit() },
  ]);
}

function setAutoStart(enabled) {
  store.setSetting('autoStart', enabled);
  try { applyAutoStart(enabled); } catch (err) { console.error('Auto-start:', err); }
  tray?.setContextMenu(buildTrayMenu());
  sendToMain('app:settings', store.settings);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => openMainWindow());
}

// ---------- Communication avec les post-its ----------

function noteIdOf(event) {
  for (const [id, win] of windows) {
    if (!win.isDestroyed() && win.webContents === event.sender) return id;
  }
  return null;
}

ipcMain.handle('note:get', (event) => {
  const id = noteIdOf(event);
  return id ? store.getNote(id) : null;
});

ipcMain.handle('note:update', (event, patch) => {
  const id = noteIdOf(event);
  if (!id || !patch || typeof patch !== 'object') return null;
  const allowed = {};
  for (const key of ['blocks', 'color']) {
    if (key in patch) allowed[key] = patch[key];
  }
  const note = store.updateNote(id, allowed);
  if (allowed.color) windows.get(id)?.setBackgroundColor(allowed.color);
  notesChanged();
  return note;
});

ipcMain.handle('note:toggle-pin', (event) => {
  const id = noteIdOf(event);
  const note = id && store.getNote(id);
  if (!note) return false;
  return setNoteProps(id, { pinned: !note.pinned }).pinned;
});

ipcMain.handle('note:create', (event) => {
  const id = noteIdOf(event);
  const current = id && store.getNote(id);
  const win = id && windows.get(id);
  const near = current && win ? { ...win.getBounds(), color: current.color } : null;
  createNote(near);
});

ipcMain.handle('note:delete', (event) => {
  const id = noteIdOf(event);
  return id ? confirmDelete(id, windows.get(id)) : false;
});

ipcMain.handle('note:hide', (event) => {
  const id = noteIdOf(event);
  if (id) setNoteProps(id, { hidden: true });
});

ipcMain.handle('note:open-app', () => openMainWindow('notes'));

// Fenêtre principale
ipcMain.handle('app:notes', () => store.notes);
ipcMain.handle('app:note-create', () => createNote().id);
ipcMain.handle('app:note-open', (_e, id) => openNoteForEdit(id));
ipcMain.handle('app:note-set', (_e, id, props) => setNoteProps(id, props || {}));
ipcMain.handle('app:note-delete', (_e, id) => confirmDelete(id, mainWin));
ipcMain.handle('app:notes-show-all', () => showAllNotes());
ipcMain.handle('app:notes-hide-all', () => hideAllNotes());
ipcMain.handle('app:settings', () => ({ ...store.settings, dataFile: store.file, version: app.getVersion() }));
ipcMain.handle('app:set-autostart', (_e, enabled) => setAutoStart(!!enabled));

// ---------- Cycle de vie ----------

app.on('second-instance', () => openMainWindow());

// Les post-its ne se ferment pas l'app : elle reste dans la zone de notification.
app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  quitting = true;
  store?.flush();
});

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));

  if (store.settings.autoStart) {
    try { applyAutoStart(true); } catch (err) { console.error('Auto-start:', err); }
  }

  createTray();
  initReminders(store, (state) => sendToMain('reminders:state', state));

  for (const note of store.notes) {
    migrateNote(note);
    if (!note.hidden) openNoteWindow(note);
  }

  // Lancé à l'ouverture de session : discret. Lancé à la main : on ouvre l'interface.
  if (!process.argv.includes(AUTOSTART_ARG)) openMainWindow();

  app.on('activate', () => openMainWindow());
});
