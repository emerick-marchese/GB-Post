// Interface d'un post-it : du texte libre et des cases à cocher, mélangés dans
// l'ordre qu'on veut, plus la couleur et le mode épinglé.
// Chaque changement est envoyé immédiatement au processus principal qui l'enregistre.

const COLORS = [
  '#fff176', // jaune
  '#ffcc80', // orange
  '#f8bbd0', // rose
  '#ef9a9a', // rouge
  '#ce93d8', // violet
  '#90caf9', // bleu
  '#80deea', // turquoise
  '#c5e1a5', // vert
  '#e0e0e0', // gris
  '#ffffff', // blanc
];

const $ = (sel) => document.querySelector(sel);
const blocksEl = $('#blocks');
const paletteEl = $('#palette');
const swatchesEl = $('#swatches');
const customColorEl = $('#custom-color');
const colorBtn = $('#btn-color');
const progressEl = $('#progress');
const savedEl = $('#saved');

let note = null;
let savedTimer = null;
let focusedIndex = -1;

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function save(patch) {
  Object.assign(note, patch);
  await window.gbpost.update(patch);
  savedEl.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => savedEl.classList.remove('show'), 1200);
}

function saveBlocks() {
  save({ blocks: note.blocks });
  renderProgress();
}

// ---------- Couleur ----------

function applyColor(color) {
  document.documentElement.style.setProperty('--note', color);
  customColorEl.value = color;
  for (const s of swatchesEl.children) {
    s.classList.toggle('selected', s.dataset.color.toLowerCase() === color.toLowerCase());
  }
}

function setColor(color) {
  applyColor(color);
  save({ color });
}

function buildPalette() {
  for (const color of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.dataset.color = color;
    b.style.background = color;
    b.title = color;
    b.addEventListener('click', () => setColor(color));
    swatchesEl.appendChild(b);
  }
  customColorEl.addEventListener('input', () => setColor(customColorEl.value));
}

function closePalette() {
  paletteEl.hidden = true;
  colorBtn.classList.remove('active');
}

// ---------- Mode épinglé ----------

function applyPinned(pinned) {
  note.pinned = pinned;
  document.body.classList.toggle('pinned', pinned);
  for (const ta of blocksEl.querySelectorAll('textarea')) ta.readOnly = pinned;
  if (pinned) {
    closePalette();
    document.activeElement?.blur();
  }
  requestAnimationFrame(growAll);
}

async function togglePinned() {
  applyPinned(await window.gbpost.togglePin());
}

// ---------- Blocs (texte / case à cocher) ----------

function grow(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight}px`;
}

function growAll() {
  for (const ta of blocksEl.querySelectorAll('textarea')) grow(ta);
}

function renderProgress() {
  const checks = note.blocks.filter((b) => b.type === 'check');
  const done = checks.filter((b) => b.done).length;
  progressEl.textContent = checks.length ? `${done}/${checks.length} fait${done > 1 ? 's' : ''}` : '';
}

function focusBlock(index, caret = 'end') {
  const ta = blocksEl.children[index]?.querySelector('textarea');
  if (!ta) return;
  ta.focus();
  const pos = caret === 'start' ? 0 : ta.value.length;
  ta.setSelectionRange(pos, pos);
}

function insertBlock(type, afterIndex = note.blocks.length - 1, text = '') {
  const block = { id: uid(), type, text };
  if (type === 'check') block.done = false;
  note.blocks.splice(afterIndex + 1, 0, block);
  saveBlocks();
  renderBlocks();
  focusBlock(afterIndex + 1, 'start');
}

function removeBlock(index, focusPrevious = false) {
  note.blocks.splice(index, 1);
  if (note.blocks.length === 0) note.blocks.push({ id: uid(), type: 'text', text: '' });
  saveBlocks();
  renderBlocks();
  if (focusPrevious) focusBlock(Math.max(0, index - 1));
}

function setType(index, type) {
  const block = note.blocks[index];
  block.type = type;
  if (type === 'check') block.done = false;
  else delete block.done;
  saveBlocks();
  renderBlocks();
  focusBlock(index, 'start');
}

// Ajoute un bloc juste après celui où se trouve le curseur (ou à la fin).
function addBlock(type) {
  if (note.pinned) return;
  const at = focusedIndex >= 0 && focusedIndex < note.blocks.length ? focusedIndex : note.blocks.length - 1;
  const current = note.blocks[at];
  // Un paragraphe vide est simplement transformé plutôt que d'empiler du vide.
  if (current && !current.text && current.type !== type) setType(at, type);
  else insertBlock(type, at);
}

let dragIndex = null;

function renderBlocks() {
  blocksEl.textContent = '';
  note.blocks.forEach((block, index) => {
    const row = document.createElement('div');
    row.className = `block ${block.type}`;
    row.classList.toggle('done', !!block.done);
    row.classList.toggle('empty', !block.text.trim());

    const handle = document.createElement('span');
    handle.className = 'handle';
    handle.textContent = '⋮⋮';
    handle.title = 'Glisser pour déplacer';
    handle.draggable = true;
    handle.addEventListener('dragstart', (e) => {
      dragIndex = index;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setDragImage(row, 10, 10);
    });
    handle.addEventListener('dragend', () => {
      dragIndex = null;
      renderBlocks();
    });
    row.addEventListener('dragover', (e) => {
      if (dragIndex === null) return;
      e.preventDefault();
      for (const el of blocksEl.children) el.classList.remove('drop-before');
      row.classList.add('drop-before');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index) return;
      const [moved] = note.blocks.splice(dragIndex, 1);
      note.blocks.splice(dragIndex < index ? index - 1 : index, 0, moved);
      dragIndex = null;
      saveBlocks();
      renderBlocks();
    });
    row.append(handle);

    if (block.type === 'check') {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!block.done;
      // Cocher reste possible même quand le post-it est épinglé.
      box.addEventListener('change', () => {
        block.done = box.checked;
        row.classList.toggle('done', block.done);
        saveBlocks();
      });
      row.append(box);
    }

    const ta = document.createElement('textarea');
    ta.rows = 1;
    ta.value = block.text;
    ta.readOnly = !!note.pinned;
    ta.spellcheck = true;
    ta.placeholder = block.type === 'check' ? 'Élément…' : (index === 0 ? 'Écris ici…' : '');
    ta.addEventListener('focus', () => { focusedIndex = index; });
    ta.addEventListener('input', () => {
      // Raccourci : taper "[] " ou "- " au début d'un paragraphe en fait une case à cocher.
      if (block.type === 'text' && /^(\[ ?\]|-) $/.test(ta.value)) {
        block.text = '';
        setType(index, 'check');
        return;
      }
      block.text = ta.value;
      row.classList.toggle('empty', !block.text.trim());
      grow(ta);
      saveBlocks();
    });
    ta.addEventListener('keydown', (e) => {
      if (note.pinned) return;
      const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
      if (block.type === 'check' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // Entrée sur une case vide : on sort de la liste et on repasse en texte normal.
        if (!ta.value) { setType(index, 'text'); return; }
        const tail = ta.value.slice(ta.selectionEnd);
        block.text = ta.value.slice(0, ta.selectionStart);
        insertBlock('check', index, tail);
      } else if (e.key === 'Backspace' && atStart) {
        if (block.type === 'check') {
          e.preventDefault();
          setType(index, 'text');
        } else if (!ta.value && note.blocks.length > 1) {
          e.preventDefault();
          removeBlock(index, true);
        }
      } else if (e.key === 'ArrowUp' && index > 0 && !ta.value.slice(0, ta.selectionStart).includes('\n')) {
        e.preventDefault();
        focusBlock(index - 1);
      } else if (e.key === 'ArrowDown' && index < note.blocks.length - 1 && !ta.value.slice(ta.selectionEnd).includes('\n')) {
        e.preventDefault();
        focusBlock(index + 1);
      }
    });
    row.append(ta);

    const del = document.createElement('button');
    del.className = 'block-del';
    del.textContent = '✕';
    del.title = 'Supprimer';
    del.addEventListener('click', () => removeBlock(index));
    row.append(del);

    blocksEl.appendChild(row);
  });
  renderProgress();
  requestAnimationFrame(growAll);
}

// Clic dans le vide sous le contenu : on écrit à la suite.
$('#content').addEventListener('mousedown', (e) => {
  if (note.pinned || e.target.id !== 'content') return;
  e.preventDefault();
  const last = note.blocks[note.blocks.length - 1];
  if (last.type === 'text' && !last.text) focusBlock(note.blocks.length - 1);
  else insertBlock('text');
});

// ---------- Barre d'outils ----------

$('#btn-new').addEventListener('click', () => window.gbpost.createNote());
$('#btn-add-text').addEventListener('click', () => addBlock('text'));
$('#btn-add-check').addEventListener('click', () => addBlock('check'));
// Les boutons "Ajouter" ne doivent pas faire perdre la position du curseur.
for (const b of document.querySelectorAll('.add-row button')) b.addEventListener('mousedown', (e) => e.preventDefault());
colorBtn.addEventListener('click', () => {
  paletteEl.hidden = !paletteEl.hidden;
  colorBtn.classList.toggle('active', !paletteEl.hidden);
});
$('#btn-pin').addEventListener('click', togglePinned);
$('#btn-edit').addEventListener('click', togglePinned);
$('#btn-delete').addEventListener('click', () => window.gbpost.deleteNote());
$('#btn-hide').addEventListener('click', () => window.gbpost.hideNote());
$('#btn-app').addEventListener('click', () => window.gbpost.openApp());

// Modifications faites depuis la fenêtre principale de GB Post.
window.gbpost.onChanged((updated) => {
  if (!note) return;
  if (updated.color && updated.color !== note.color) applyColor(updated.color);
  note.color = updated.color;
  if (!!updated.pinned !== !!note.pinned) applyPinned(!!updated.pinned);
});

window.addEventListener('resize', growAll);

// Raccourcis clavier
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'n') { e.preventDefault(); window.gbpost.createNote(); }
  if (mod && key === 'l') { e.preventDefault(); addBlock('check'); }
  if (mod && key === 't') { e.preventDefault(); addBlock('text'); }
  if (e.key === 'Escape' && !paletteEl.hidden) closePalette();
});

// ---------- Démarrage ----------

async function init() {
  buildPalette();
  note = await window.gbpost.getNote();
  if (!note) return;
  if (!Array.isArray(note.blocks) || note.blocks.length === 0) {
    note.blocks = [{ id: uid(), type: 'text', text: '' }];
  }
  applyColor(note.color || COLORS[0]);
  renderBlocks();
  applyPinned(!!note.pinned);
  if (!note.pinned && note.blocks.length === 1 && !note.blocks[0].text) focusBlock(0);
}

init();
