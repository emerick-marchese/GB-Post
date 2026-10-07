// Interface d'un post-it : texte libre, checklist et couleur.
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
const textEl = $('#text');
const listEl = $('#checklist');
const addItemBtn = $('#btn-add-item');
const paletteEl = $('#palette');
const swatchesEl = $('#swatches');
const customColorEl = $('#custom-color');
const pinBtn = $('#btn-pin');
const progressEl = $('#progress');
const savedEl = $('#saved');

let note = null;
let savedTimer = null;

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

function saveChecklist() {
  save({ checklist: note.checklist });
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

// ---------- Texte ----------

function autoGrow() {
  textEl.style.height = 'auto';
  textEl.style.height = `${textEl.scrollHeight}px`;
}

textEl.addEventListener('input', () => {
  autoGrow();
  save({ text: textEl.value });
});

// ---------- Checklist ----------

function renderProgress() {
  const items = note.checklist || [];
  const done = items.filter((i) => i.done).length;
  progressEl.textContent = items.length ? `${done}/${items.length} fait${done > 1 ? 's' : ''}` : '';
}

function focusItem(index, atEnd = true) {
  const input = listEl.children[index]?.querySelector('.item-text');
  if (!input) return;
  input.focus();
  const pos = atEnd ? input.value.length : 0;
  input.setSelectionRange(pos, pos);
}

function addItem(afterIndex = note.checklist.length - 1, text = '') {
  const item = { id: uid(), text, done: false };
  note.checklist.splice(afterIndex + 1, 0, item);
  saveChecklist();
  renderChecklist();
  focusItem(afterIndex + 1);
}

function removeItem(index, focusPrevious = false) {
  note.checklist.splice(index, 1);
  saveChecklist();
  renderChecklist();
  if (focusPrevious) {
    if (index > 0) focusItem(index - 1);
    else textEl.focus();
  }
}

let dragIndex = null;

function renderChecklist() {
  listEl.textContent = '';
  note.checklist.forEach((item, index) => {
    const li = document.createElement('li');
    li.classList.toggle('done', item.done);

    const handle = document.createElement('span');
    handle.className = 'handle';
    handle.textContent = '⋮⋮';
    handle.title = 'Glisser pour réordonner';
    handle.draggable = true;
    handle.addEventListener('dragstart', (e) => {
      dragIndex = index;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setDragImage(li, 10, 10);
    });
    handle.addEventListener('dragend', () => {
      dragIndex = null;
      renderChecklist();
    });
    li.addEventListener('dragover', (e) => {
      if (dragIndex === null) return;
      e.preventDefault();
      for (const el of listEl.children) el.classList.remove('drop-before');
      li.classList.add('drop-before');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index) return;
      const [moved] = note.checklist.splice(dragIndex, 1);
      note.checklist.splice(dragIndex < index ? index - 1 : index, 0, moved);
      dragIndex = null;
      saveChecklist();
      renderChecklist();
    });

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!item.done;
    box.addEventListener('change', () => {
      item.done = box.checked;
      li.classList.toggle('done', item.done);
      saveChecklist();
    });

    const input = document.createElement('input');
    input.className = 'item-text';
    input.type = 'text';
    input.value = item.text;
    input.placeholder = 'Élément…';
    input.addEventListener('input', () => {
      item.text = input.value;
      saveChecklist();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Coupe le texte au curseur, comme dans un éditeur classique.
        const tail = input.value.slice(input.selectionEnd);
        item.text = input.value.slice(0, input.selectionStart);
        addItem(index, tail);
        focusItem(index + 1, false);
      } else if (e.key === 'Backspace' && input.value === '') {
        e.preventDefault();
        removeItem(index, true);
      } else if (e.key === 'ArrowUp' && index > 0) {
        e.preventDefault();
        focusItem(index - 1);
      } else if (e.key === 'ArrowDown' && index < note.checklist.length - 1) {
        e.preventDefault();
        focusItem(index + 1);
      }
    });

    const del = document.createElement('button');
    del.className = 'item-del';
    del.textContent = '✕';
    del.title = 'Supprimer cet élément';
    del.addEventListener('click', () => removeItem(index));

    li.append(handle, box, input, del);
    listEl.appendChild(li);
  });
  addItemBtn.hidden = note.checklist.length === 0;
  renderProgress();
}

addItemBtn.addEventListener('click', () => addItem());

// ---------- Barre d'outils ----------

$('#btn-new').addEventListener('click', () => window.gbpost.createNote());
$('#btn-check').addEventListener('click', () => addItem());
$('#btn-color').addEventListener('click', () => {
  paletteEl.hidden = !paletteEl.hidden;
  $('#btn-color').classList.toggle('active', !paletteEl.hidden);
});
pinBtn.addEventListener('click', async () => {
  const pinned = await window.gbpost.togglePin();
  pinBtn.classList.toggle('active', pinned);
});
$('#btn-delete').addEventListener('click', () => window.gbpost.deleteNote());

// Raccourcis clavier
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); window.gbpost.createNote(); }
  if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); addItem(); }
  if (e.key === 'Escape' && !paletteEl.hidden) $('#btn-color').click();
});

// ---------- Démarrage ----------

async function init() {
  buildPalette();
  note = await window.gbpost.getNote();
  if (!note) return;
  note.checklist = Array.isArray(note.checklist) ? note.checklist : [];
  applyColor(note.color || COLORS[0]);
  textEl.value = note.text || '';
  pinBtn.classList.toggle('active', !!note.pinned);
  renderChecklist();
  requestAnimationFrame(autoGrow);
  if (!note.text && note.checklist.length === 0) textEl.focus();
}

init();
