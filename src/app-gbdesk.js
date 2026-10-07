// Fenêtre principale - onglet GBDESK : le site de tickets affiché dans l'app,
// la liste des derniers tickets et la configuration de la surveillance.
// ($, el et pad viennent de app.js.)

const desk = window.gbdesk;
let deskState = null;
let webview = null;
let deskActive = false;

function deskTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// ---------- Site GBDESK intégré ----------

function ensureWebview(url) {
  if (!url) return;
  if (!webview) {
    webview = document.createElement('webview');
    webview.className = 'desk-webview';
    webview.setAttribute('partition', deskState.partition);
    webview.setAttribute('src', url);
    $('#desk-site').append(webview);
  } else if (webview.getAttribute('src') !== url && !webview.dataset.navigated) {
    webview.setAttribute('src', url);
  }
}

function navigate(url) {
  if (!url || !/^https?:\/\//i.test(url)) return;
  if (!webview) ensureWebview(url);
  else {
    webview.dataset.navigated = '1';
    webview.loadURL(url).catch(() => {});
  }
}

const wv = (fn) => () => { try { if (webview) fn(webview); } catch (_) {} };
$('#desk-back').addEventListener('click', wv((w) => w.canGoBack() && w.goBack()));
$('#desk-forward').addEventListener('click', wv((w) => w.canGoForward() && w.goForward()));
$('#desk-reload').addEventListener('click', wv((w) => w.reload()));
$('#desk-home').addEventListener('click', () => navigate(deskState?.siteUrl));
$('#desk-external').addEventListener('click', () => {
  let url = deskState?.siteUrl;
  try { if (webview) url = webview.getURL() || url; } catch (_) {}
  window.gbapp.openExternal(url);
});
$('#desk-toggle-list').addEventListener('click', () => {
  const list = $('#desk-list');
  list.hidden = !list.hidden;
  $('#desk-toggle-list').classList.toggle('active', !list.hidden);
  try { localStorage.setItem('deskList', list.hidden ? '0' : '1'); } catch (_) {}
});

// ---------- Liste des tickets ----------

function renderDesk() {
  const s = deskState;
  if (!s) return;
  const configured = !!s.siteUrl || s.configured;
  $('#desk-empty').hidden = configured;
  $('#desk-nav').hidden = !s.siteUrl;
  $('#desk-external').hidden = !s.siteUrl;
  if (s.siteUrl) ensureWebview(s.siteUrl);

  let status = '';
  if (!s.configured) status = s.siteUrl ? 'Surveillance des tickets non configurée' : '';
  else if (s.lastError) status = `⚠ ${s.lastError}`;
  else if (s.lastCheck) status = `✓ Vérifié à ${deskTime(s.lastCheck)}`;
  else status = 'Vérification…';
  const st = $('#desk-status');
  st.textContent = status;
  st.classList.toggle('error', !!s.lastError);
  st.title = status;

  const ul = $('#desk-tickets');
  ul.textContent = '';
  for (const t of s.tickets || []) {
    const li = el('li', { className: `desk-ticket${t.isNew ? ' is-new' : ''}` },
      el('div', { className: 'dt-top' },
        el('span', { className: 'dt-id', textContent: `#${t.id}` }),
        t.isNew ? el('span', { className: 'dt-new', textContent: 'nouveau' }) : '',
        el('span', { className: 'dt-time', textContent: deskTime(t.date || t.receivedAt) })),
      el('div', { className: 'dt-subject', textContent: t.subject }),
      el('div', { className: 'dt-author', textContent: t.author }));
    li.title = 'Ouvrir le ticket';
    li.addEventListener('click', async () => navigate(await desk.link(t.id)));
    ul.append(li);
  }
  $('#desk-tickets-empty').hidden = (s.tickets || []).length > 0;
  $('#desk-tickets-empty').textContent = s.configured ? "Aucun ticket pour l'instant." : 'Configure la surveillance pour voir les tickets ici.';

  const unread = s.unread || 0;
  $('#count-gbdesk').textContent = unread ? String(unread) : '';
  if (deskActive && unread) desk.markRead();
}

$('#desk-check').addEventListener('click', () => desk.checkNow());

document.addEventListener('viewchange', (e) => {
  deskActive = e.detail === 'gbdesk';
  if (deskActive && deskState?.unread) desk.markRead();
});

// ---------- Configuration ----------

function openConfig() {
  const s = deskState || {};
  $('#desk-site-url').value = s.siteUrl || '';
  $('#desk-api-url').value = s.apiUrl || '';
  $('#desk-header').value = s.header || '';
  $('#desk-ticket-url').value = s.ticketUrl || '';
  $('#desk-interval').value = String(s.intervalSec || 60);
  if (!$('#desk-interval').value) $('#desk-interval').value = '60';
  $('#desk-notify').checked = s.notify !== false;
  $('#desk-f-id').value = s.fields?.id || '';
  $('#desk-f-subject').value = s.fields?.subject || '';
  $('#desk-f-author').value = s.fields?.author || '';
  $('#desk-test-result').hidden = true;
  $('#desk-config').hidden = false;
  $('#desk-site-url').focus();
}

function formValues() {
  return {
    siteUrl: $('#desk-site-url').value,
    apiUrl: $('#desk-api-url').value,
    header: $('#desk-header').value,
    ticketUrl: $('#desk-ticket-url').value,
    intervalSec: $('#desk-interval').value,
    notify: $('#desk-notify').checked,
    fields: { id: $('#desk-f-id').value, subject: $('#desk-f-subject').value, author: $('#desk-f-author').value },
  };
}

$('#desk-config-open').addEventListener('click', openConfig);
$('#desk-config-open2').addEventListener('click', openConfig);
$('#desk-config-cancel').addEventListener('click', () => { $('#desk-config').hidden = true; });
$('#desk-config').addEventListener('mousedown', (e) => { if (e.target.id === 'desk-config') $('#desk-config').hidden = true; });

$('#desk-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const before = deskState?.siteUrl;
  deskState = await desk.save(formValues());
  $('#desk-config').hidden = true;
  if (deskState.siteUrl && deskState.siteUrl !== before) navigate(deskState.siteUrl);
  renderDesk();
});

// Le test utilise l'adresse saisie : on enregistre d'abord.
$('#desk-test').addEventListener('click', async () => {
  const box = $('#desk-test-result');
  box.hidden = false;
  box.className = 'test-result';
  box.textContent = 'Test en cours…';
  deskState = await desk.save(formValues());
  renderDesk();
  const r = await desk.test();
  if (r.ok) {
    box.classList.add('ok');
    box.textContent = r.sample
      ? `✓ ${r.count} ticket(s) trouvé(s). Exemple : #${r.sample.id} « ${r.sample.subject} » par ${r.sample.author}.`
      : '✓ Connexion réussie, mais la liste est vide pour le moment.';
  } else {
    box.classList.add('ko');
    box.textContent = `✗ ${r.error}`;
  }
});

$('#desk-simulate').addEventListener('click', () => desk.simulate());

desk.onState((s) => { deskState = s; renderDesk(); });
desk.onNavigate(navigate);

async function initGbdesk(openUrl) {
  deskState = await desk.get();
  try { if (localStorage.getItem('deskList') === '0') { $('#desk-list').hidden = true; } } catch (_) {}
  $('#desk-toggle-list').classList.toggle('active', !$('#desk-list').hidden);
  renderDesk();
  if (openUrl) navigate(openUrl);
}
