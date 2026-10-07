// Fenêtre principale de GB Post : navigation, réglages et outils partagés.

const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
}

const VIEWS = ['notes', 'alarm', 'timer', 'stopwatch', 'settings'];

function showView(view) {
  if (!VIEWS.includes(view)) view = 'notes';
  for (const b of document.querySelectorAll('.nav button')) b.classList.toggle('active', b.dataset.view === view);
  for (const v of document.querySelectorAll('.view')) v.classList.toggle('active', v.dataset.view === view);
  try { localStorage.setItem('view', view); } catch (_) {}
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

// ---------- Démarrage ----------

window.addEventListener('DOMContentLoaded', async () => {
  let view = new URLSearchParams(location.search).get('view');
  if (!view) { try { view = localStorage.getItem('view'); } catch (_) {} }
  showView(view);
  renderSettings(await window.gbapp.getSettings());
  await Promise.all([initReminders(), initNotes()]);
});
