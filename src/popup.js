// Alerte de rappel affichée au centre de l'écran (sans son).
const api = window.gbreminders;
const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');

const KINDS = {
  alarm: '⏰ Alarme',
  timer: '⏳ Minuteur terminé',
  snooze: '🔁 Rappel',
};

function updateClock() {
  const d = new Date();
  $('#clock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function close(action) {
  $('#card').classList.add('leaving');
  setTimeout(action, 200);
}

$('#done').addEventListener('click', () => close(api.dismiss));
$('#snooze').addEventListener('click', () => close(api.snooze));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Enter') close(api.dismiss);
});

(async () => {
  const r = await api.getPopup();
  if (!r) return;
  $('#kind').textContent = KINDS[r.kind] || KINDS.alarm;
  $('#task').textContent = r.label || "C'est l'heure !";
  document.title = `Rappel : ${r.label || "C'est l'heure !"}`;
  updateClock();
  setInterval(updateClock, 1000);
  $('#done').focus();
})();
