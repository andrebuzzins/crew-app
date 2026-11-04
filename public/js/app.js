// Avvio dell'app. Ogni sezione ha il suo file:
// actions.js (Azioni Rapide + bacheca), segnalazioni.js ("Oggi vi segnalo" + Archivio),
// fantafiga.js (conteggio), fanta.js (Voto della serata), radar.js, roulette.js, sfide.js.

let me = null;

window.onMemberChosen = function (member) {
  me = member;
  const img = document.getElementById('my-avatar');
  img.src = member.avatar;
  img.style.objectPosition = member.pos || '';
  document.getElementById('my-name').innerText = member.name;
  startPresence(member);
  renderFanta();      // le righe da votare dipendono da chi sei
  renderFantaFiga();  // i propri eventi si possono eliminare
};

document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  renderOnline([]);

  const saved = getCurrentMember();
  if (saved) window.onMemberChosen(saved);
  else showWhoAmI();

  initActions();
  initSegnalazioni();
  initFantaFiga();
  initFanta();
  initRadar();
  initRoulette();
  initSfide();
});
