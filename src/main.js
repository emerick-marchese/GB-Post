// GB Post - processus principal Electron.
// Chaque post-it est une petite fenêtre sans bordure posée sur le bureau.
// L'app vit dans la zone de notification (tray) et se lance au démarrage.
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Store = require('./store');
const { initReminders, openRemindersWindow } = require('./reminders');

const APP_NAME = 'GB Post';
const ASSETS = path.join(__dirname, '..', 'assets');
const DEFAULT_COLOR = '#fff176';
const DEFAULT_SIZE = { width: 280, height: 300 };

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('com.gbpost.app');

// Une seule instance : relancer l'app ouvre simplement un nouveau post-it.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let store;
let tray = null;
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
        `Exec=${exec}`,
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
  app.setLoginItemSettings({ openAtLogin: enabled, path: exe, args });
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
  migrateNote(note);
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
    store.updateNote(note.id, { x: b.x, y: b.y, width: b.width, height: b.height });
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
  return note;
}

function showAllNotes() {
  for (const win of windows.values()) {
    if (win.isMinimized()) win.restore();
    win.showInactive();
    win.moveTop();
  }
}

// ---------- Zone de notification ----------

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Nouveau post-it', click: () => createNote() },
    { label: 'Afficher tous les post-its', click: showAllNotes },
    { type: 'separator' },
    { label: 'Rappels…', click: () => openRemindersWindow() },
    { label: '⏰ Nouvelle alarme', click: () => openRemindersWindow('alarm') },
    { label: '⏳ Minuteur', click: () => openRemindersWindow('timer') },
    { label: '⏱ Chronomètre', click: () => openRemindersWindow('stopwatch') },
    { type: 'separator' },
    {
      label: 'Lancer au démarrage',
      type: 'checkbox',
      checked: !!store.settings.autoStart,
      click: (item) => {
        store.setSetting('autoStart', item.checked);
        applyAutoStart(item.checked);
      },
    },
    { type: 'separator' },
    { label: `Quitter ${APP_NAME}`, click: () => app.quit() },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', showAllNotes);
  tray.on('double-click', () => createNote());
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
  return note;
});

ipcMain.handle('note:toggle-pin', (event) => {
  const id = noteIdOf(event);
  const note = id && store.getNote(id);
  if (!note) return false;
  const pinned = !note.pinned;
  store.updateNote(id, { pinned });
  const win = windows.get(id);
  win?.setMovable(!pinned);
  win?.setResizable(!pinned);
  return pinned;
});

ipcMain.handle('note:create', (event) => {
  const id = noteIdOf(event);
  const current = id && store.getNote(id);
  const win = id && windows.get(id);
  const near = current && win ? { ...win.getBounds(), color: current.color } : null;
  createNote(near);
});

ipcMain.handle('note:delete', async (event) => {
  const id = noteIdOf(event);
  const note = id && store.getNote(id);
  const win = id && windows.get(id);
  if (!note || !win) return false;
  const isEmpty = !(note.blocks || []).some((b) => b.text?.trim());
  if (!isEmpty) {
    const { response } = await dialog.showMessageBox(win, {
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
  win.destroy();
  return true;
});

// ---------- Cycle de vie ----------

app.on('second-instance', () => createNote());

// Les post-its ne se ferment pas l'app : elle reste dans la zone de notification.
app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  store?.flush();
});

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  app.dock?.hide();

  if (store.settings.autoStart) {
    try { applyAutoStart(true); } catch (err) { console.error('Auto-start:', err); }
  }

  createTray();
  initReminders(store);

  if (store.notes.length === 0) {
    createNote();
  } else {
    for (const note of store.notes) openNoteWindow(note);
  }

  app.on('activate', showAllNotes);
});
