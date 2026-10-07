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
const titleEl = $('#title');
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
  for (const ed of blocksEl.querySelectorAll('.editor')) ed.contentEditable = pinned ? 'false' : 'true';
  titleEl.readOnly = pinned;
  if (pinned) {
    closePalette();
    document.activeElement?.blur();
  }
}

async function togglePinned() {
  applyPinned(await window.gbpost.togglePin());
}

// ---------- Blocs (texte / case à cocher) ----------
// Chaque bloc est une zone de texte mis en forme (gras, italique, souligné),
// alignable à gauche, au centre ou à droite.

function renderProgress() {
  const checks = note.blocks.filter((b) => b.type === 'check');
  const done = checks.filter((b) => b.done).length;
  progressEl.textContent = checks.length ? `${done}/${checks.length} fait${done > 1 ? 's' : ''}` : '';
}

function editorOf(index) {
  return blocksEl.children[index]?.querySelector('.editor');
}

function placeCaret(ed, atStart) {
  ed.focus();
  const r = document.createRange();
  r.selectNodeContents(ed);
  r.collapse(atStart);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

function focusBlock(index, caret = 'end') {
  const ed = editorOf(index);
  if (ed) placeCaret(ed, caret === 'start');
}

// Le curseur est-il tout au début / tout à la fin de la zone ?
function caretEdges(ed) {
  const sel = getSelection();
  if (!sel.rangeCount) return { atStart: false, atEnd: false };
  const r = sel.getRangeAt(0);
  if (!r.collapsed || !ed.contains(r.startContainer)) return { atStart: false, atEnd: false };
  const before = document.createRange();
  before.selectNodeContents(ed);
  before.setEnd(r.startContainer, r.startOffset);
  const after = document.createRange();
  after.selectNodeContents(ed);
  after.setStart(r.endContainer, r.endOffset);
  const empty = (range) => range.toString().length === 0 && !range.cloneContents().querySelector('br:not(:last-child)');
  return { atStart: empty(before), atEnd: empty(after) };
}

// Recopie le contenu de la zone dans le bloc (HTML nettoyé + texte brut).
function syncBlock(block, ed) {
  if (ed.textContent === '' && ed.innerHTML !== '') ed.innerHTML = ''; // garde le texte d'aide visible
  block.html = GBRich.sanitize(ed.innerHTML);
  block.text = GBRich.toText(block.html);
}

function insertBlock(type, afterIndex = note.blocks.length - 1, html = '') {
  const block = { id: uid(), type, html, text: GBRich.toText(html) };
  if (type === 'check') block.done = false;
  note.blocks.splice(afterIndex + 1, 0, block);
  saveBlocks();
  renderBlocks();
  focusBlock(afterIndex + 1, 'start');
}

function removeBlock(index, focusPrevious = false) {
  note.blocks.splice(index, 1);
  if (note.blocks.length === 0) note.blocks.push({ id: uid(), type: 'text', text: '', html: '' });
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
    row.classList.toggle('empty', !(block.text || '').trim());

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

    const ed = document.createElement('div');
    ed.className = 'editor';
    ed.contentEditable = note.pinned ? 'false' : 'true';
    ed.spellcheck = true;
    ed.innerHTML = GBRich.blockHtml(block);
    ed.style.textAlign = GBRich.align(block.align);
    ed.dataset.placeholder = block.type === 'check' ? 'Élément…' : (index === 0 ? 'Écris ici…' : '');
    ed.addEventListener('focus', () => { focusedIndex = index; });
    ed.addEventListener('input', () => {
      // Raccourci : taper "[] " ou "- " au début d'un paragraphe en fait une case à cocher.
      if (block.type === 'text' && /^(\[ ?\]|-) $/.test(ed.textContent.replace(/ /g, ' '))) {
        block.html = '';
        block.text = '';
        setType(index, 'check');
        return;
      }
      syncBlock(block, ed);
      row.classList.toggle('empty', !block.text.trim());
      saveBlocks();
    });
    // Coller : on garde seulement le texte (la mise en forme du site d'origine est ignorée).
    ed.addEventListener('paste', (e) => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
    ed.addEventListener('keydown', (e) => {
      if (note.pinned) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (block.type !== 'check' || e.shiftKey) {
          document.execCommand('insertLineBreak');
          return;
        }
        // Entrée sur une case vide : on sort de la liste et on repasse en texte normal.
        if (!ed.textContent) { setType(index, 'text'); return; }
        // Coupe la case au curseur : la fin (avec sa mise en forme) passe dans une nouvelle case.
        const sel = getSelection();
        const r = sel.getRangeAt(0);
        r.deleteContents();
        const tail = document.createRange();
        tail.setStart(r.startContainer, r.startOffset);
        tail.setEnd(ed, ed.childNodes.length);
        const box = document.createElement('div');
        box.append(tail.extractContents());
        syncBlock(block, ed);
        insertBlock('check', index, GBRich.sanitize(box.innerHTML));
        return;
      }
      const { atStart, atEnd } = caretEdges(ed);
      if (e.key === 'Backspace' && atStart) {
        if (block.type === 'check') {
          e.preventDefault();
          setType(index, 'text');
        } else if (!ed.textContent && note.blocks.length > 1) {
          e.preventDefault();
          removeBlock(index, true);
        }
      } else if (e.key === 'ArrowUp' && atStart) {
        e.preventDefault();
        if (index === 0) titleEl.focus(); else focusBlock(index - 1);
      } else if (e.key === 'ArrowDown' && atEnd && index < note.blocks.length - 1) {
        e.preventDefault();
        focusBlock(index + 1, 'start');
      }
    });
    row.append(ed);

    const del = document.createElement('button');
    del.className = 'block-del';
    del.textContent = '✕';
    del.title = 'Supprimer';
    del.addEventListener('click', () => removeBlock(index));
    row.append(del);

    blocksEl.appendChild(row);
  });
  renderProgress();
}

// ---------- Mise en forme : gras, italique, souligné, alignement ----------

const formatBar = $('#format-bar');
let titleFocused = false;

function applyStyle(cmd) {
  if (note.pinned || titleFocused) return;
  document.execCommand(cmd);
  // execCommand déclenche "input" sur la zone : la sauvegarde suit toute seule.
  updateFormatState();
}

function setAlign(value) {
  if (note.pinned) return;
  if (titleFocused) {
    titleEl.style.textAlign = value;
    save({ titleAlign: value });
  } else {
    const block = note.blocks[focusedIndex];
    const ed = editorOf(focusedIndex);
    if (!block || !ed) return;
    block.align = value;
    ed.style.textAlign = value;
    saveBlocks();
  }
  updateFormatState();
}

function currentAlign() {
  if (titleFocused) return GBRich.align(note.titleAlign);
  return GBRich.align(note.blocks[focusedIndex]?.align);
}

function updateFormatState() {
  const inEditor = !!document.activeElement?.classList?.contains('editor');
  for (const b of formatBar.querySelectorAll('[data-cmd]')) {
    b.disabled = !inEditor;
    b.classList.toggle('active', inEditor && document.queryCommandState(b.dataset.cmd));
  }
  const align = currentAlign();
  for (const b of formatBar.querySelectorAll('[data-align]')) b.classList.toggle('active', b.dataset.align === align);
}

for (const b of formatBar.querySelectorAll('button')) {
  b.addEventListener('mousedown', (e) => e.preventDefault()); // garde la sélection
  b.addEventListener('click', () => (b.dataset.cmd ? applyStyle(b.dataset.cmd) : setAlign(b.dataset.align)));
}
document.addEventListener('selectionchange', () => { if (!note?.pinned) updateFormatState(); });

// La barre de mise en forme apparaît quand on écrit dans le post-it.
document.addEventListener('focusin', (e) => {
  titleFocused = e.target === titleEl;
  if (e.target === titleEl || e.target.classList?.contains('editor')) {
    document.body.classList.add('editing');
    updateFormatState();
  }
});
document.addEventListener('focusout', () => {
  setTimeout(() => {
    const a = document.activeElement;
    if (a !== titleEl && !a?.classList?.contains('editor')) document.body.classList.remove('editing');
  }, 0);
});

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
  if ((updated.title || '') !== (note.title || '') && document.activeElement !== titleEl) {
    note.title = updated.title;
    note.titleAlign = updated.titleAlign;
    renderTitle();
  }
});

// Poignée de redimensionnement : on suit la souris et on demande la nouvelle
// taille au processus principal (les bords de la fenêtre marchent aussi).
const grip = $('#grip');
let resizeStart = null;
let resizeFrame = null;
grip.addEventListener('pointerdown', (e) => {
  if (note?.pinned) return;
  e.preventDefault();
  grip.setPointerCapture(e.pointerId);
  resizeStart = { x: e.screenX, y: e.screenY, w: window.outerWidth, h: window.outerHeight };
});
grip.addEventListener('pointermove', (e) => {
  if (!resizeStart) return;
  const w = resizeStart.w + (e.screenX - resizeStart.x);
  const h = resizeStart.h + (e.screenY - resizeStart.y);
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => window.gbpost.resize(w, h));
});
const endResize = () => { resizeStart = null; };
grip.addEventListener('pointerup', endResize);
grip.addEventListener('pointercancel', endResize);

// Raccourcis clavier
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'n') { e.preventDefault(); window.gbpost.createNote(); }
  if (mod && key === 'l') { e.preventDefault(); addBlock('check'); }
  if (mod && key === 't') { e.preventDefault(); addBlock('text'); }
  if (e.key === 'Escape' && !paletteEl.hidden) closePalette();
});

// ---------- Titre ----------

function renderTitle() {
  titleEl.value = note.title || '';
  titleEl.style.textAlign = GBRich.align(note.titleAlign);
  titleEl.classList.toggle('empty', !titleEl.value.trim());
}

titleEl.addEventListener('input', () => {
  titleEl.classList.toggle('empty', !titleEl.value.trim());
  save({ title: titleEl.value });
});
titleEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault();
    focusBlock(0, 'start');
  }
});

// ---------- Démarrage ----------

async function init() {
  buildPalette();
  note = await window.gbpost.getNote();
  if (!note) return;
  if (!Array.isArray(note.blocks) || note.blocks.length === 0) {
    note.blocks = [{ id: uid(), type: 'text', text: '', html: '' }];
  }
  applyColor(note.color || COLORS[0]);
  renderTitle();
  renderBlocks();
  applyPinned(!!note.pinned);
  if (!note.pinned && !note.title && note.blocks.length === 1 && !note.blocks[0].text) titleEl.focus();
}

init();
