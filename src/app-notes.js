// Fenêtre principale - gestion des post-its : liste, recherche, création,
// affichage / masquage sur le bureau, couleur, épinglage, suppression.
// ($, el et pad viennent de app.js.)

const notesApi = window.gbapp;

const NOTE_COLORS = [
  '#fff176', '#ffcc80', '#f8bbd0', '#ef9a9a', '#ce93d8',
  '#90caf9', '#80deea', '#c5e1a5', '#e0e0e0', '#ffffff',
];
const PREVIEW_BLOCKS = 7;

let notes = [];
let noteFilter = 'all';
let noteQuery = '';

function noteText(note) {
  return (note.blocks || []).map((b) => b.text || '').join('\n');
}

function isEmptyNote(note) {
  return !noteText(note).trim();
}

function timeAgo(ts) {
  if (!ts) return '';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = new Date(ts);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'hier';
  return `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

function matchesFilter(note) {
  if (noteFilter === 'desk' && note.hidden) return false;
  if (noteFilter === 'pinned' && !note.pinned) return false;
  if (noteFilter === 'hidden' && !note.hidden) return false;
  if (noteQuery && !noteText(note).toLowerCase().includes(noteQuery)) return false;
  return true;
}

// ---------- Palette de couleurs (petite fenêtre flottante) ----------

const palettePop = $('#palette-pop');
let paletteFor = null;

function openPalette(note, anchor) {
  paletteFor = note.id;
  palettePop.textContent = '';
  for (const color of NOTE_COLORS) {
    const b = el('button', { className: 'swatch', title: color });
    b.style.background = color;
    b.classList.toggle('selected', color.toLowerCase() === (note.color || '').toLowerCase());
    b.addEventListener('click', () => {
      notesApi.setNote(note.id, { color });
      closePalette();
    });
    palettePop.append(b);
  }
  palettePop.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = palettePop.offsetWidth;
  palettePop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  palettePop.style.top = `${r.bottom + 6}px`;
}

function closePalette() {
  palettePop.hidden = true;
  paletteFor = null;
}

document.addEventListener('mousedown', (e) => {
  if (!palettePop.hidden && !palettePop.contains(e.target) && !e.target.closest('[data-action="color"]')) closePalette();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePalette(); });

// ---------- Cartes ----------

function previewOf(note) {
  const box = el('div', { className: 'preview' });
  const blocks = (note.blocks || []).filter((b) => b.text?.trim());
  if (!blocks.length) {
    box.append(el('p', { className: 'placeholder', textContent: 'Post-it vide' }));
    return box;
  }
  for (const b of blocks.slice(0, PREVIEW_BLOCKS)) {
    if (b.type === 'check') {
      box.append(el('div', { className: `pv-check${b.done ? ' done' : ''}` },
        el('span', { className: 'box', textContent: b.done ? '☑' : '☐' }),
        el('span', { textContent: b.text })));
    } else {
      box.append(el('p', { className: 'pv-text', textContent: b.text }));
    }
  }
  if (blocks.length > PREVIEW_BLOCKS) box.append(el('div', { className: 'more', textContent: `+ ${blocks.length - PREVIEW_BLOCKS} autre(s)…` }));
  return box;
}

function actionButton(action, icon, title) {
  const b = el('button', { className: 'card-btn', textContent: icon, title });
  b.dataset.action = action;
  return b;
}

function noteCard(note) {
  const checks = (note.blocks || []).filter((b) => b.type === 'check');
  const done = checks.filter((b) => b.done).length;

  const badges = el('div', { className: 'badges' });
  if (note.pinned) badges.append(el('span', { className: 'badge', textContent: '📌 Épinglé' }));
  if (note.hidden) badges.append(el('span', { className: 'badge muted', textContent: 'Masqué' }));

  const meta = [checks.length ? `${done}/${checks.length} fait${done > 1 ? 's' : ''}` : '', timeAgo(note.updatedAt)].filter(Boolean).join(' · ');

  const actions = el('div', { className: 'card-actions' },
    actionButton('edit', '✏️', 'Modifier sur le bureau'),
    actionButton('visibility', note.hidden ? '👁' : '🙈', note.hidden ? 'Afficher sur le bureau' : 'Masquer du bureau'),
    actionButton('color', '🎨', 'Changer la couleur'),
    actionButton('pin', '📌', note.pinned ? 'Désépingler' : 'Épingler sur le bureau'),
    el('div', { className: 'spacer' }),
    actionButton('delete', '🗑', 'Supprimer'));
  actions.querySelector('[data-action="pin"]').classList.toggle('active', !!note.pinned);

  const card = el('article', { className: `note-card${note.hidden ? ' is-hidden' : ''}` },
    badges, previewOf(note), el('div', { className: 'note-meta', textContent: meta }), actions);
  card.style.setProperty('--note', note.color || NOTE_COLORS[0]);
  card.title = 'Cliquer pour modifier';

  card.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    const action = btn ? btn.dataset.action : 'edit';
    if (action === 'edit') notesApi.openNote(note.id);
    else if (action === 'visibility') notesApi.setNote(note.id, { hidden: !note.hidden });
    else if (action === 'pin') notesApi.setNote(note.id, { pinned: !note.pinned, hidden: false });
    else if (action === 'delete') notesApi.deleteNote(note.id);
    else if (action === 'color') {
      if (paletteFor === note.id) closePalette(); else openPalette(note, btn);
    }
  });
  return card;
}

function renderNotes() {
  const grid = $('#note-grid');
  grid.textContent = '';
  const sorted = [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const visible = sorted.filter(matchesFilter);
  for (const note of visible) grid.append(noteCard(note));

  $('#notes-empty').hidden = notes.length > 0;
  $('#notes-noresult').hidden = notes.length === 0 || visible.length > 0;
  $('#note-filters').hidden = notes.length === 0;
  $('#count-notes').textContent = notes.length || '';
}

// ---------- Barre d'outils ----------

$('#note-new').addEventListener('click', () => notesApi.createNote());
$('#note-new-empty').addEventListener('click', () => notesApi.createNote());
$('#notes-show-all').addEventListener('click', () => notesApi.showAllNotes());
$('#notes-hide-all').addEventListener('click', () => notesApi.hideAllNotes());
$('#note-search').addEventListener('input', (e) => {
  noteQuery = e.target.value.trim().toLowerCase();
  renderNotes();
});
for (const chip of document.querySelectorAll('#note-filters .chip')) {
  chip.addEventListener('click', () => {
    noteFilter = chip.dataset.filter;
    for (const c of document.querySelectorAll('#note-filters .chip')) c.classList.toggle('on', c === chip);
    renderNotes();
  });
}

notesApi.onNotes((list) => {
  notes = list;
  renderNotes();
});
// Rafraîchit les "il y a X min".
setInterval(renderNotes, 60000);

async function initNotes() {
  notes = await notesApi.getNotes();
  renderNotes();
}
