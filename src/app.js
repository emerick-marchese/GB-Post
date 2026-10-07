// Fenêtre principale de GB Post : navigation, réglages et outils partagés.

const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
}

const VIEWS = ['notes', 'alarm', 'timer', 'stopwatch', 'gbdesk', 'settings'];

function showView(view) {
  if (!VIEWS.includes(view)) view = 'notes';
  for (const b of document.querySelectorAll('.nav button')) b.classList.toggle('active', b.dataset.view === view);
  for (const v of document.querySelectorAll('.view')) v.classList.toggle('active', v.dataset.view === view);
  try { localStorage.setItem('view', view); } catch (_) {}
  document.dispatchEvent(new CustomEvent('viewchange', { detail: view }));
}

for (const b of document.querySelectorAll('.nav button')) b.addEventListener('click', () => showView(b.dataset.view));
window.gbapp.onView(showView);

// ---------- Réglages ----------

function renderSettings(s) {
  $('#set-autostart').checked = !!s.autoStart;
  if (s.dataFile) $('#set-datafile').textContent = s.dataFile;
  if (s.version) $('#set-version').textContent = `version ${s.version}`;
}

$('#set-autostart').addEventListener('change', (e) => window.gbapp.setAutoStart(e.target.checked));
window.gbapp.onSettings(renderSettings);

// ---------- Mises à jour ----------

const UPDATE_TEXT = {
  idle: 'GB Post se met à jour tout seul.',
  checking: 'Recherche de mises à jour…',
  'up-to-date': 'Tu as la dernière version. ✓',
  downloading: 'Téléchargement de la nouvelle version…',
  ready: 'Nouvelle version prête : redémarre GB Post pour l\'installer (sinon elle s\'installera à la prochaine fermeture).',
  error: 'Impossible de vérifier les mises à jour pour le moment (connexion ?).',
  unsupported: 'Mises à jour automatiques disponibles dans la version installée de GB Post.',
};

function renderUpdate(u) {
  if (!u) return;
  let text = UPDATE_TEXT[u.state] || UPDATE_TEXT.idle;
  if (u.state === 'downloading') text = `Téléchargement de la version ${u.version || ''}… ${u.percent || 0} %`;
  $('#update-status').textContent = text;
  const ready = u.state === 'ready';
  $('#update-install').hidden = !ready;
  $('#update-check').hidden = ready;
  $('#update-check').disabled = u.state === 'checking' || u.state === 'downloading' || u.state === 'unsupported';
  $('#update-banner').hidden = !ready;
  $('#update-banner-version').textContent = u.version || '';
}

$('#update-check').addEventListener('click', () => window.gbapp.checkForUpdates());
$('#update-install').addEventListener('click', () => window.gbapp.installUpdate());
$('#update-banner-install').addEventListener('click', () => window.gbapp.installUpdate());
window.gbapp.onUpdate(renderUpdate);

// ---------- Démarrage ----------

window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  let view = params.get('view');
  if (!view) { try { view = localStorage.getItem('view'); } catch (_) {} }
  showView(view);
  renderSettings(await window.gbapp.getSettings());
  renderUpdate(await window.gbapp.getUpdateStatus());
  await Promise.all([initReminders(), initNotes(), initGbdesk(params.get('gbdesk'))]);
});
