// Avvio dell'app e logica delle sezioni.
// Per ora Fanta Figa e Roulette funzionano solo su questo telefono:
// le rendiamo condivise nei prossimi passi.

let me = null;

window.onMemberChosen = function (member) {
  me = member;
  document.getElementById('my-avatar').src = member.avatar;
  document.getElementById('my-name').innerText = member.name;
  startPresence(member);
};

document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  renderFantaPlayers();
  renderOnline([]);
  initActions();

  const saved = getCurrentMember();
  if (saved) window.onMemberChosen(saved);
  else showWhoAmI();
});

// ---------- FANTA FIGA (ancora locale) ----------
let fantaTimeLeft = 60;
let fantaInterval;
const scores = {};

function renderFantaPlayers() {
  const box = document.getElementById('fanta-players');
  box.innerHTML = '';
  window.CREW_MEMBERS.forEach(m => {
    scores[m.id] = 1;
    box.insertAdjacentHTML('beforeend', `
      <div class="flex items-center justify-between bg-black bg-opacity-40 p-3 rounded-2xl shadow-sm border border-white border-opacity-10 backdrop-blur-md">
        <div class="flex items-center gap-3 w-28">
          <img src="${m.avatar}" class="w-10 h-10 rounded-full object-cover border border-gray-400">
          <span class="font-bold text-lg text-white">${m.name}</span>
        </div>
        <div class="flex items-center gap-4">
          <button onclick="updateScore('${m.id}', -1)" class="btn-score btn-fanta w-10 h-10 rounded-full text-xl font-bold text-red-400">-</button>
          <span id="score-${m.id}" class="font-clash text-2xl font-extrabold w-8 text-center text-white drop-shadow-md">1</span>
          <button onclick="updateScore('${m.id}', 1)" class="btn-score btn-fanta w-10 h-10 rounded-full text-xl font-bold text-green-400">+</button>
        </div>
      </div>`);
  });
}

function creaEventoFanta() {
  const input = document.getElementById('fanta-event-name');
  const titleInput = document.getElementById('fanta-event-title');
  const setupDiv = document.getElementById('fanta-setup');
  const gridDiv = document.getElementById('fanta-grid');

  if (input.value.trim() === '') input.value = 'Serata Casuale';

  titleInput.value = input.value;
  setupDiv.classList.add('hidden');
  gridDiv.classList.remove('hidden');
  gridDiv.classList.add('flex');

  if (navigator.vibrate) navigator.vibrate([30]);

  const timerDisplay = document.getElementById('fanta-timer');
  fantaTimeLeft = 60;
  timerDisplay.innerText = fantaTimeLeft + 's';
  timerDisplay.className = 'text-sm font-black text-red-500 bg-red-900 bg-opacity-40 border border-red-500 px-2 py-1 rounded-md transition-all';

  window.CREW_MEMBERS.forEach(m => {
    scores[m.id] = 1;
    document.getElementById('score-' + m.id).innerText = '1';
  });

  const buttons = document.querySelectorAll('.btn-fanta');
  buttons.forEach(b => {
    b.disabled = false;
    b.style.opacity = '1';
    b.style.cursor = 'pointer';
  });

  clearInterval(fantaInterval);
  fantaInterval = setInterval(() => {
    fantaTimeLeft--;
    timerDisplay.innerText = fantaTimeLeft + 's';

    if (fantaTimeLeft <= 10 && fantaTimeLeft > 0) timerDisplay.classList.add('animate-pulse');

    if (fantaTimeLeft <= 0) {
      clearInterval(fantaInterval);
      timerDisplay.innerText = 'SCADUTO!';
      timerDisplay.classList.remove('animate-pulse', 'text-red-500');
      timerDisplay.classList.add('text-white', 'bg-red-600');
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      buttons.forEach(b => {
        b.disabled = true;
        b.style.opacity = '0.4';
        b.style.cursor = 'not-allowed';
      });
    }
  }, 1000);
}

function updateScore(player, change) {
  if (fantaTimeLeft <= 0) return; // voti bloccati a tempo scaduto
  const newScore = scores[player] + change;
  if (newScore >= 1 && newScore <= 10) {
    scores[player] = newScore;
    document.getElementById('score-' + player).innerText = newScore;
    if (navigator.vibrate) navigator.vibrate(change > 0 ? [15, 30, 15] : [40]);
  }
}

// Azioni Rapide: vedi js/actions.js

// ---------- LA ROULETTE (ancora locale) ----------
let isSpinning = false;

function startRoulette() {
  if (isSpinning) return;
  const names = window.CREW_MEMBERS.map(m => m.name);
  if (navigator.vibrate) navigator.vibrate([20, 50, 20]);

  isSpinning = true;
  const resultEl = document.getElementById('roulette-result');
  let spinCount = 0;
  const maxSpins = 25;

  resultEl.style.filter = 'blur(1px)';
  resultEl.style.transform = 'scale(1.05)';

  const interval = setInterval(() => {
    resultEl.innerText = names[Math.floor(Math.random() * names.length)];
    if (navigator.vibrate && spinCount % 2 === 0) navigator.vibrate([10]);
    spinCount++;

    if (spinCount >= maxSpins) {
      clearInterval(interval);
      resultEl.innerText = names[Math.floor(Math.random() * names.length)];
      resultEl.style.filter = 'blur(0px)';
      resultEl.style.transform = 'scale(1.1)';
      resultEl.style.color = '#ec4899';
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      setTimeout(() => {
        resultEl.style.transform = 'scale(1)';
        resultEl.style.color = '';
        isSpinning = false;
      }, 500);
    }
  }, 80);
}
