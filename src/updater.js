// Mises à jour automatiques : GB Post vérifie les nouvelles versions publiées
// sur GitHub, les télécharge en arrière-plan et se met à jour sur place
// (même application, mêmes données), sans réinstallation.
const { app } = require('electron');

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

let autoUpdater = null;
let status = { state: 'idle', version: null, percent: 0, message: '' };
let onStatus = () => {};

function setStatus(patch) {
  status = { ...status, ...patch };
  onStatus(status);
}

function check() {
  if (!autoUpdater) {
    setStatus({ state: 'unsupported' });
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => setStatus({ state: 'error', message: String(err?.message || err) }));
}

function initUpdater(listener) {
  if (listener) onStatus = listener;
  // En développement (npm start) il n'y a rien à mettre à jour.
  if (!app.isPackaged) {
    setStatus({ state: 'unsupported' });
    return;
  }
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = true;
  // Si on ne clique pas sur "Redémarrer", la mise à jour s'installe à la fermeture.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => setStatus({ state: 'up-to-date' }));
  autoUpdater.on('update-available', (info) => setStatus({ state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => setStatus({ state: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => setStatus({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => setStatus({ state: 'error', message: String(err?.message || err) }));

  setTimeout(check, 10 * 1000);
  setInterval(check, CHECK_EVERY_MS);
}

// Redémarre tout de suite sur la nouvelle version (installation silencieuse).
function installUpdate() {
  if (autoUpdater && status.state === 'ready') autoUpdater.quitAndInstall(true, true);
}

module.exports = { initUpdater, checkForUpdates: check, installUpdate, getUpdateStatus: () => status };
