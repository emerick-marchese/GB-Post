// Persistance des post-its : un fichier JSON dans le dossier utilisateur de l'app.
// Chaque modification est écrite sur le disque (écriture atomique : fichier
// temporaire puis renommage, pour ne jamais corrompre les données).
const fs = require('fs');
const path = require('path');

const SAVE_DELAY_MS = 150;

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'gb-post-data.json');
    this.timer = null;
    this.data = Store.defaults();
    this.load();
  }

  static defaults() {
    return {
      settings: { autoStart: true },
      notes: [],
      alarms: [],
      timers: [],
      stopwatch: { running: false, startedAt: null, elapsedMs: 0, laps: [] },
      gbdesk: {
        siteUrl: '',
        apiUrl: '',
        header: '',
        ticketUrl: '',
        intervalSec: 60,
        notify: true,
        fields: { id: '', subject: '', author: '' },
        seen: [],
        tickets: [],
        unread: 0,
      },
    };
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      const d = Store.defaults();
      this.data = {
        settings: { ...d.settings, ...(parsed.settings || {}) },
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        alarms: Array.isArray(parsed.alarms) ? parsed.alarms : [],
        timers: Array.isArray(parsed.timers) ? parsed.timers : [],
        stopwatch: { ...d.stopwatch, ...(parsed.stopwatch || {}) },
        gbdesk: { ...d.gbdesk, ...(parsed.gbdesk || {}) },
      };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Fichier illisible : on garde une copie pour ne rien perdre.
        try { fs.copyFileSync(this.file, `${this.file}.bak-${Date.now()}`); } catch (_) {}
      }
    }
  }

  // Sauvegarde quasi immédiate ; les changements très rapprochés (frappe au
  // clavier, déplacement de fenêtre) sont regroupés en une seule écriture.
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  get notes() { return this.data.notes; }
  get settings() { return this.data.settings; }

  getNote(id) { return this.data.notes.find((n) => n.id === id); }

  addNote(note) {
    this.data.notes.push(note);
    this.save();
    return note;
  }

  // touch : false pour les changements qui ne sont pas des modifications du
  // contenu (position, taille, affichage), afin de garder la date "modifié".
  updateNote(id, patch, touch = true) {
    const note = this.getNote(id);
    if (!note) return null;
    Object.assign(note, patch, touch ? { updatedAt: Date.now() } : {});
    this.save();
    return note;
  }

  removeNote(id) {
    this.data.notes = this.data.notes.filter((n) => n.id !== id);
    this.save();
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  }
}

module.exports = Store;
