// Mise en forme du texte des post-its : gras, italique et souligné.
// Le texte est gardé en HTML très simple (b, i, u, br) ; tout le reste est
// retiré pour qu'aucun contenu collé ne puisse injecter autre chose.
(function () {
  const KEEP = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u' };
  const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'IMG', 'SVG']);

  function copyClean(from, to) {
    for (const child of from.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        to.append(child.nodeValue);
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE || DROP_TAGS.has(child.tagName)) continue;
      if (child.tagName === 'BR') {
        to.append(document.createElement('br'));
        continue;
      }
      // Les retours à la ligne créés par l'éditeur (<div>…</div>) deviennent des <br>.
      if (BLOCK_TAGS.has(child.tagName) && to.lastChild && to.lastChild.nodeName !== 'BR') {
        to.append(document.createElement('br'));
      }
      if (KEEP[child.tagName]) {
        const kept = document.createElement(KEEP[child.tagName]);
        copyClean(child, kept);
        if (kept.childNodes.length) to.append(kept); // pas de balise vide
      } else {
        copyClean(child, to);
      }
    }
  }

  function sanitize(html) {
    const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
    const out = document.createElement('div');
    copyClean(doc.body, out);
    return out.innerHTML;
  }

  function escape(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML.replace(/\n/g, '<br>');
  }

  // Texte brut (pour la recherche, l'aperçu vide/plein, etc.).
  function toText(html) {
    const d = document.createElement('div');
    d.innerHTML = sanitize(html).replace(/<br>/g, '\n');
    return d.textContent;
  }

  // HTML sûr d'un bloc, y compris pour les anciens post-its en texte simple.
  function blockHtml(block) {
    return block.html != null ? sanitize(block.html) : escape(block.text);
  }

  const ALIGNS = ['left', 'center', 'right'];
  const align = (a) => (ALIGNS.includes(a) ? a : 'left');

  window.GBRich = { sanitize, escape, toText, blockHtml, align };
})();
