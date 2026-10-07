// Fenêtre "Rappels" : alarmes, minuteurs et chronomètre.
// L'état vit dans le processus principal ; cette fenêtre ne fait que l'afficher.

const api = window.gbreminders;
const $ = (sel) => document.querySelector(sel);

// Jours affichés du lundi au dimanche (valeurs JavaScript : 0 = dimanche).
const DAYS = [[1, 'L', 'Lun'], [2, 'M', 'Mar'], [3, 'M', 'Mer'], [4, 'J', 'Jeu'], [5, 'V', 'Ven'], [6, 'S', 'Sam'], [0, 'D', 'Dim']];
const PRESETS = [1, 5, 10, 15, 30, 60];

let state = { alarms: [], timers: [], stopwatch: { running: false, elapsedMs: 0, laps: [] } };
let clockOffset = 0; // écart entre l'horloge du processus principal et celle-ci
let editingAlarmId = null;
let selectedDays = new Set();

const pad = (n) => String(n).padStart(2, '0');
const now = () => Date.now() + clockOffset;

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
}

function formatDuration(ms, withHours = false) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h || withHours ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatIn(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  if (h < 24) return `dans ${h} h${rest ? ` ${pad(rest)}` : ''}`;
  const d = Math.floor(h / 24);
  return `dans ${d} jour${d > 1 ? 's' : ''}`;
}

function describeDays(days) {
  if (!days?.length) return 'Une fois';
  if (days.length === 7) return 'Tous les jours';
  const key = [...days].sort().join();
  if (key === '1,2,3,4,5') return 'En semaine';
  if (key === '0,6') return 'Le week-end';
  return DAYS.filter(([v]) => days.includes(v)).map(([, , name]) => name).join(', ');
}

function setState(s) {
  state = s;
  clockOffset = s.now - Date.now();
  renderAlarms();
  renderTimers();
  renderStopwatch();
}

// ---------- Onglets ----------

function showTab(tab) {
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.tab === tab);
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('active', p.dataset.panel === tab);
  try { localStorage.setItem('tab', tab); } catch (_) {}
  if (tab === 'alarm') $('#alarm-time').focus();
}

for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => showTab(b.dataset.tab));

// ---------- Alarmes ----------

function renderDays() {
  const box = $('#alarm-days');
  box.textContent = '';
  for (const [value, letter, name] of DAYS) {
    const b = el('button', { type: 'button', className: `day${selectedDays.has(value) ? ' on' : ''}`, textContent: letter, title: name });
    b.addEventListener('click', () => {
      if (selectedDays.has(value)) selectedDays.delete(value); else selectedDays.add(value);
      renderDays();
    });
    box.append(b);
  }
}

function resetAlarmForm() {
  editingAlarmId = null;
  const d = new Date(Date.now() + 60 * 60000);
  $('#alarm-time').value = `${pad(d.getHours())}:00`;
  $('#alarm-label').value = '';
  selectedDays = new Set();
  $('#alarm-submit').textContent = "Ajouter l'alarme";
  $('#alarm-cancel').hidden = true;
  renderDays();
}

function editAlarm(alarm) {
  editingAlarmId = alarm.id;
  $('#alarm-time').value = alarm.time;
  $('#alarm-label').value = alarm.label || '';
  selectedDays = new Set(alarm.days || []);
  $('#alarm-submit').textContent = 'Enregistrer';
  $('#alarm-cancel').hidden = false;
  renderDays();
  $('#alarm-label').focus();
}

$('#alarm-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setState(await api.saveAlarm({
    id: editingAlarmId,
    time: $('#alarm-time').value,
    label: $('#alarm-label').value.trim(),
    days: [...selectedDays],
  }));
  resetAlarmForm();
});
$('#alarm-cancel').addEventListener('click', resetAlarmForm);

function renderAlarms() {
  const list = $('#alarm-list');
  list.textContent = '';
  $('#alarm-empty').hidden = state.alarms.length > 0;
  for (const alarm of state.alarms) {
    const meta = el('div', { className: 'meta' });
    meta.dataset.alarmMeta = alarm.id;
    const info = el('div', { className: 'info' },
      el('div', { className: 'time', textContent: alarm.time }),
      el('div', { className: 'label', textContent: alarm.label || 'Alarme' }),
      meta);
    info.addEventListener('click', () => editAlarm(alarm));
    info.title = 'Cliquer pour modifier';

    const input = el('input', { type: 'checkbox', checked: !!alarm.enabled });
    input.addEventListener('change', async () => setState(await api.toggleAlarm(alarm.id)));
    const toggle = el('label', { className: 'switch', title: alarm.enabled ? 'Désactiver' : 'Activer' }, input, el('span'));

    const del = el('button', { className: 'icon-btn danger', textContent: '✕', title: 'Supprimer' });
    del.addEventListener('click', async () => {
      if (editingAlarmId === alarm.id) resetAlarmForm();
      setState(await api.deleteAlarm(alarm.id));
    });

    list.append(el('li', { className: `card item clickable${alarm.enabled ? '' : ' off'}` }, info, toggle, del));
  }
  updateAlarmMeta();
}

function updateAlarmMeta() {
  for (const alarm of state.alarms) {
    const meta = document.querySelector(`[data-alarm-meta="${alarm.id}"]`);
    if (!meta) continue;
    const when = alarm.enabled && alarm.nextAt ? ` · ${formatIn(alarm.nextAt - now())}` : ' · désactivée';
    meta.textContent = describeDays(alarm.days) + when;
  }
}

// ---------- Minuteurs ----------

for (const min of PRESETS) {
  const b = el('button', { type: 'button', textContent: min >= 60 ? `${min / 60} h` : `${min} min` });
  b.addEventListener('click', () => {
    $('#timer-h').value = Math.floor(min / 60);
    $('#timer-m').value = min % 60;
    $('#timer-s').value = 0;
  });
  $('#timer-presets').append(b);
}

$('#timer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = (id) => Math.max(0, parseInt($(id).value, 10) || 0);
  const durationMs = ((n('#timer-h') * 60 + n('#timer-m')) * 60 + n('#timer-s')) * 1000;
  if (durationMs < 1000) return;
  setState(await api.startTimer({ durationMs, label: $('#timer-label').value.trim() }));
  $('#timer-label').value = '';
});

function remainingOf(t) {
  return t.running ? t.endsAt - now() : t.remainingMs;
}

function renderTimers() {
  const list = $('#timer-list');
  list.textContent = '';
  $('#timer-empty').hidden = state.timers.length > 0;
  for (const t of state.timers) {
    const time = el('div', { className: 'time' });
    time.dataset.timer = t.id;
    const bar = el('div');
    bar.dataset.timerBar = t.id;
    const info = el('div', { className: 'info' },
      time,
      el('div', { className: 'label', textContent: t.label || 'Minuteur' }),
      el('div', { className: 'meta', textContent: t.snooze ? 'Rappel reporté' : `Minuteur de ${formatDuration(t.durationMs)}${t.running ? '' : ' · en pause'}` }),
      el('div', { className: 'progress' }, bar));

    const pause = el('button', { className: 'icon-btn', textContent: t.running ? '⏸' : '▶', title: t.running ? 'Pause' : 'Reprendre' });
    pause.addEventListener('click', async () => setState(await (t.running ? api.pauseTimer(t.id) : api.resumeTimer(t.id))));
    const del = el('button', { className: 'icon-btn danger', textContent: '✕', title: 'Annuler' });
    del.addEventListener('click', async () => setState(await api.cancelTimer(t.id)));

    list.append(el('li', { className: `card item${t.running ? '' : ' off'}` }, info, pause, del));
  }
  updateTimers();
}

function updateTimers() {
  for (const t of state.timers) {
    const left = remainingOf(t);
    const time = document.querySelector(`[data-timer="${t.id}"]`);
    if (time) time.textContent = formatDuration(left, t.durationMs >= 3600e3);
    const bar = document.querySelector(`[data-timer-bar="${t.id}"]`);
    if (bar) bar.style.width = `${Math.min(100, (1 - left / t.durationMs) * 100)}%`;
  }
}

// ---------- Chronomètre ----------

function swElapsed() {
  const sw = state.stopwatch;
  return sw.elapsedMs + (sw.running ? now() - sw.startedAt : 0);
}

function formatStopwatch(ms) {
  const cs = Math.floor(ms / 10) % 100;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { main: `${h ? `${h}:` : ''}${pad(m)}:${pad(s)}`, cs: `.${pad(cs)}` };
}

function renderStopwatch() {
  const sw = state.stopwatch;
  $('#sw-toggle').textContent = sw.running ? 'Pause' : (sw.elapsedMs ? 'Reprendre' : 'Démarrer');
  $('#sw-lap').disabled = !sw.running;
  $('#sw-reset').disabled = sw.running || !sw.elapsedMs;
  const laps = $('#sw-laps');
  laps.textContent = '';
  sw.laps.forEach((t, i) => {
    const prev = sw.laps[i + 1] || 0;
    const total = formatStopwatch(t);
    const diff = formatStopwatch(t - prev);
    laps.append(el('li', {},
      el('span', { textContent: `Tour ${sw.laps.length - i}` }),
      el('span', { textContent: total.main + total.cs }),
      el('span', { textContent: `+${diff.main}${diff.cs}` })));
  });
  updateStopwatch();
}

function updateStopwatch() {
  const { main, cs } = formatStopwatch(swElapsed());
  const d = $('#sw-display');
  d.firstChild.textContent = main;
  d.lastChild.textContent = cs;
}

$('#sw-toggle').addEventListener('click', async () => {
  setState(await (state.stopwatch.running ? api.pauseStopwatch() : api.startStopwatch()));
});
$('#sw-lap').addEventListener('click', async () => setState(await api.lapStopwatch()));
$('#sw-reset').addEventListener('click', async () => setState(await api.resetStopwatch()));

// ---------- Démarrage ----------

function loop() {
  updateTimers();
  updateStopwatch();
  requestAnimationFrame(loop);
}
setInterval(updateAlarmMeta, 15000);

api.onState(setState);
api.onTab(showTab);

(async () => {
  resetAlarmForm();
  setState(await api.getState());
  let tab = new URLSearchParams(location.search).get('tab');
  if (!tab) { try { tab = localStorage.getItem('tab'); } catch (_) {} }
  showTab(['alarm', 'timer', 'stopwatch'].includes(tab) ? tab : 'alarm');
  requestAnimationFrame(loop);
})();
