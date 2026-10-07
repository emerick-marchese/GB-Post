// GBDESK : surveillance des nouveaux tickets du site de tickets de l'entreprise.
//
// L'app interroge régulièrement une adresse qui renvoie la liste des tickets en
// JSON. La requête passe par la même session que l'onglet GBDESK de la fenêtre
// principale : si tu es connecté au site dans l'onglet, la surveillance utilise
// cette connexion (pas besoin de clé d'API). Un en-tête HTTP (jeton) peut aussi
// être ajouté.
//
// Pour chaque nouveau ticket, une notification apparaît en haut au milieu de
// l'écran avec le logo, l'objet du ticket et la personne qui l'a créé.
const { BrowserWindow, ipcMain, screen, session } = require('electron');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const PARTITION = 'persist:gbdesk';
const MIN_INTERVAL_SEC = 15;
const MAX_SEEN = 2000;
const MAX_LIST = 50;
const MAX_TOASTS_AT_ONCE = 4;
const TOAST_SIZE = { width: 480, height: 132 };
const TOAST_GAP = 8;

let store;
let onState = () => {};
let onOpenTicket = () => {};
let timer = null;
let checking = false;
let lastCheck = null;
let lastError = '';
const toasts = new Map(); // webContents.id -> { win, ticket }

const cfg = () => store.data.gbdesk;

// ---------- Lecture du JSON renvoyé par GBDESK ----------

const ARRAY_KEYS = ['tickets', 'data', 'items', 'results', 'records', 'rows', 'list', 'content', 'hydra:member', 'value'];
const ID_KEYS = ['id', 'ticket_id', 'ticketId', 'number', 'numero', 'num', 'ref', 'reference', 'key', 'uuid'];
const SUBJECT_KEYS = ['subject', 'objet', 'title', 'titre', 'name', 'nom', 'summary', 'sujet', 'libelle', 'label'];
const AUTHOR_KEYS = ['author', 'auteur', 'requester', 'demandeur', 'created_by', 'createdBy', 'creator', 'createur',
  'user', 'utilisateur', 'customer', 'client', 'from', 'contact', 'owner', 'reporter', 'submitter', 'requester_name', 'email'];
const DATE_KEYS = ['created_at', 'createdAt', 'date', 'created', 'date_creation', 'creation_date', 'opened_at', 'updated_at'];
const URL_KEYS = ['url', 'html_url', 'link', 'lien', 'permalink'];

function findArray(json, depth = 0) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object' || depth > 3) return null;
  for (const k of ARRAY_KEYS) if (Array.isArray(json[k])) return json[k];
  for (const v of Object.values(json)) {
    const found = findArray(v, depth + 1);
    if (found) return found;
  }
  return null;
}

// Lit un champ par son chemin, ex. "requester.name".
function getPath(obj, p) {
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function firstValue(obj, custom, keys) {
  if (custom) return getPath(obj, custom);
  for (const k of keys) if (obj[k] != null && obj[k] !== '') return obj[k];
  return undefined;
}

// Transforme une personne (texte ou objet) en nom lisible.
function personName(v) {
  if (v == null) return '';
  if (typeof v !== 'object') return String(v);
  const full = [v.firstname || v.first_name || v.prenom, v.lastname || v.last_name || v.nom].filter(Boolean).join(' ');
  return String(v.name || v.full_name || v.fullname || v.displayName || v.display_name || full || v.username || v.login || v.email || '');
}

function normalize(raw) {
  const f = cfg().fields || {};
  const id = firstValue(raw, f.id, ID_KEYS);
  if (id == null || id === '') return null;
  const subject = firstValue(raw, f.subject, SUBJECT_KEYS);
  const author = firstValue(raw, f.author, AUTHOR_KEYS);
  const date = firstValue(raw, '', DATE_KEYS);
  const url = firstValue(raw, '', URL_KEYS);
  return {
    id: String(id),
    subject: typeof subject === 'object' ? personName(subject) : String(subject ?? '').trim() || 'Sans objet',
    author: personName(author).trim() || 'Inconnu',
    date: date ? String(date) : null,
    url: typeof url === 'string' && /^https?:/i.test(url) ? url : null,
  };
}

function parseTickets(json) {
  const list = findArray(json);
  if (!list) throw new Error('Aucune liste de tickets trouvée dans la réponse.');
  return list.filter((x) => x && typeof x === 'object').map(normalize).filter(Boolean);
}

// ---------- Interrogation de GBDESK ----------

function headers() {
  const h = { Accept: 'application/json' };
  const line = (cfg().header || '').trim();
  const i = line.indexOf(':');
  if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  return h;
}

async function fetchTickets() {
  const url = (cfg().apiUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("L'adresse de la liste des tickets n'est pas configurée.");
  const res = await session.fromPartition(PARTITION).fetch(url, { headers: headers(), bypassCustomProtocolHandlers: true });
  if (res.status === 401 || res.status === 403) throw new Error(`Accès refusé (${res.status}) : connecte-toi au site dans l'onglet GBDESK ou ajoute un jeton.`);
  if (!res.ok) throw new Error(`Le site a répondu ${res.status}.`);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (_) {
    throw new Error("La réponse n'est pas du JSON (c'est peut-être la page de connexion : connecte-toi dans l'onglet GBDESK).");
  }
  return parseTickets(json);
}

function ticketLink(t) {
  if (t.url) return t.url;
  const tpl = (cfg().ticketUrl || '').trim();
  if (tpl) return tpl.replace(/\{id\}/g, encodeURIComponent(t.id));
  return cfg().siteUrl || null;
}

async function check() {
  if (checking || !cfg().apiUrl) return;
  checking = true;
  try {
    const tickets = await fetchTickets();
    const c = cfg();
    const firstRun = c.seen.length === 0;
    const seen = new Set(c.seen);
    const fresh = tickets.filter((t) => !seen.has(t.id));
    // Premier passage : on mémorise les tickets existants sans notifier.
    if (!firstRun && fresh.length) {
      c.unread = (c.unread || 0) + fresh.length;
      if (c.notify) {
        fresh.slice(0, MAX_TOASTS_AT_ONCE).forEach((t) => showToast(t));
        if (fresh.length > MAX_TOASTS_AT_ONCE) {
          showToast({ id: '', subject: `+ ${fresh.length - MAX_TOASTS_AT_ONCE} autres nouveaux tickets`, author: 'GBDESK', summary: true });
        }
      }
    }
    for (const t of tickets) seen.add(t.id);
    c.seen = [...seen].slice(-MAX_SEEN);
    const byId = new Map(c.tickets.map((t) => [t.id, t]));
    for (const t of fresh) byId.set(t.id, { ...t, receivedAt: Date.now(), isNew: !firstRun });
    for (const t of tickets) if (byId.has(t.id)) byId.set(t.id, { ...byId.get(t.id), ...t });
    c.tickets = [...byId.values()].sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0)).slice(0, MAX_LIST);
    if (firstRun) c.tickets = tickets.slice(0, MAX_LIST).map((t) => ({ ...t, receivedAt: Date.now() }));
    // Le surlignage "nouveau" dure une heure.
    for (const t of c.tickets) if (t.isNew && Date.now() - (t.receivedAt || 0) > 3600e3) t.isNew = false;
    lastError = '';
  } catch (err) {
    lastError = String(err?.message || err);
  } finally {
    checking = false;
    lastCheck = Date.now();
    store.save();
    onState(state());
  }
}

function schedule() {
  clearInterval(timer);
  timer = null;
  if (!cfg().apiUrl) return;
  const sec = Math.max(MIN_INTERVAL_SEC, Number(cfg().intervalSec) || 60);
  timer = setInterval(check, sec * 1000);
}

function state() {
  const { seen, ...rest } = cfg();
  return { ...rest, partition: PARTITION, lastCheck, lastError, checking, configured: !!cfg().apiUrl };
}

// ---------- Notification en haut au milieu de l'écran ----------

function layoutToasts() {
  const { workArea } = screen.getPrimaryDisplay();
  let y = workArea.y + 14;
  for (const { win } of toasts.values()) {
    if (win.isDestroyed()) continue;
    win.setBounds({
      x: Math.round(workArea.x + (workArea.width - TOAST_SIZE.width) / 2),
      y,
      width: TOAST_SIZE.width,
      height: TOAST_SIZE.height,
    });
    y += TOAST_SIZE.height + TOAST_GAP;
  }
}

function showToast(ticket) {
  const win = new BrowserWindow({
    ...TOAST_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false, // n'interrompt pas la frappe en cours
    alwaysOnTop: true,
    show: false,
    hasShadow: false,
    title: 'GBDESK - Nouveau ticket',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-toast.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const key = win.webContents.id;
  toasts.set(key, { win, ticket });
  layoutToasts();
  win.loadFile(path.join(__dirname, 'toast.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => {
    toasts.delete(key);
    layoutToasts();
  });
}

// ---------- Communication ----------

function str(v, max = 2000) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function registerIpc() {
  ipcMain.handle('gbdesk:get', () => state());

  ipcMain.handle('gbdesk:save', (_e, input = {}) => {
    const c = cfg();
    const oldApi = c.apiUrl;
    c.siteUrl = str(input.siteUrl);
    c.apiUrl = str(input.apiUrl);
    c.header = str(input.header);
    c.ticketUrl = str(input.ticketUrl);
    c.intervalSec = Math.max(MIN_INTERVAL_SEC, parseInt(input.intervalSec, 10) || 60);
    c.notify = input.notify !== false;
    c.fields = { id: str(input.fields?.id, 100), subject: str(input.fields?.subject, 100), author: str(input.fields?.author, 100) };
    // Nouvelle source : on repart de zéro (les tickets existants ne sont pas notifiés).
    if (c.apiUrl !== oldApi) {
      c.seen = [];
      c.tickets = [];
      c.unread = 0;
    }
    store.save();
    schedule();
    check();
    return state();
  });

  // Teste la connexion sans rien enregistrer comme "vu".
  ipcMain.handle('gbdesk:test', async () => {
    try {
      const tickets = await fetchTickets();
      return { ok: true, count: tickets.length, sample: tickets[0] || null };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle('gbdesk:check-now', () => check());

  ipcMain.handle('gbdesk:simulate', () => {
    const sample = cfg().tickets[0];
    showToast({
      id: sample?.id || '',
      subject: sample?.subject || "Exemple : l'imprimante du 2e étage ne répond plus",
      author: sample?.author || 'Marie Dupont',
      url: sample?.url || null,
    });
  });

  ipcMain.handle('gbdesk:mark-read', () => {
    const c = cfg();
    c.unread = 0;
    store.save();
    onState(state());
  });

  ipcMain.handle('gbdesk:link', (_e, id) => {
    const t = cfg().tickets.find((x) => x.id === id);
    return t ? ticketLink(t) : null;
  });

  // Notification
  ipcMain.handle('toast:get', (e) => toasts.get(e.sender.id)?.ticket || null);
  ipcMain.handle('toast:close', (e) => toasts.get(e.sender.id)?.win.close());
  ipcMain.handle('toast:open', (e) => {
    const t = toasts.get(e.sender.id);
    if (!t) return;
    onOpenTicket(t.ticket.summary ? null : ticketLink(t.ticket));
    t.win.close();
  });
}

function initGbdesk(s, { onStateChange, openTicket } = {}) {
  store = s;
  if (onStateChange) onState = onStateChange;
  if (openTicket) onOpenTicket = openTicket;
  registerIpc();
  schedule();
  setTimeout(check, 5000);
}

module.exports = { initGbdesk, GBDESK_PARTITION: PARTITION, checkGbdesk: check };
