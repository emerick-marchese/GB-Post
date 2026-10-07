// Notification "nouveau ticket GBDESK" en haut au milieu de l'écran.
// Se ferme toute seule après 20 s (la souris dessus met le compte à rebours en pause).
const api = window.gbtoast;
const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');
const DURATION_MS = 20000;

let remaining = DURATION_MS;
let last = performance.now();
let hovering = false;
let closing = false;

function leave(action) {
  if (closing) return;
  closing = true;
  $('#toast').classList.add('leaving');
  setTimeout(action, 220);
}

function frame(t) {
  if (!hovering) remaining -= t - last;
  last = t;
  $('#bar').style.transform = `scaleX(${Math.max(0, remaining / DURATION_MS)})`;
  if (remaining <= 0) leave(api.close);
  else requestAnimationFrame(frame);
}

$('#toast').addEventListener('mouseenter', () => { hovering = true; });
$('#toast').addEventListener('mouseleave', () => { hovering = false; });
$('#toast').addEventListener('click', () => leave(api.open));
$('#open').addEventListener('click', (e) => { e.stopPropagation(); leave(api.open); });
$('#close').addEventListener('click', (e) => { e.stopPropagation(); leave(api.close); });

(async () => {
  const t = await api.get();
  if (!t) return;
  const d = new Date();
  $('#time').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  $('#kind').textContent = t.summary ? 'Nouveaux tickets' : `Nouveau ticket${t.id ? ` #${t.id}` : ''}`;
  $('#subject').textContent = t.subject;
  const author = $('#author');
  if (t.summary) {
    author.textContent = 'Ouvre GBDESK pour les voir.';
  } else {
    author.append('par ');
    author.append(Object.assign(document.createElement('b'), { textContent: t.author }));
  }
  requestAnimationFrame((t0) => { last = t0; requestAnimationFrame(frame); });
})();
