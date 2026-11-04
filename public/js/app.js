// Avvio dell'app. Ogni sezione ha il suo file:
// actions.js (Azioni Rapide + bacheca), segnalazioni.js ("Oggi vi segnalo" + Archivio),
// fantafiga.js (conteggio), fanta.js (Voto della serata), radar.js, roulette.js, sfide.js,
// libro.js (Il Libro Nero).

let me = null;
const CREW_FIRST_ISSUE = new Date('2026-11-03T00:00:00'); // il giorno in cui è nata l'app
const TABS = ['oggi', 'giochi', 'libro', 'crew', 'archivio'];

window.onMemberChosen = function (member) {
  me = member;
  const img = document.getElementById('my-avatar');
  img.src = member.avatar;
  img.style.objectPosition = member.pos || '';
  document.getElementById('my-name').innerText = member.name;
  startPresence(member);
  renderFanta();      // le righe da votare dipendono da chi sei
  renderFantaFiga();  // i propri eventi si possono eliminare
  renderLibro();      // "tocca a te?" dipende da chi sei
};

// ---------- Schede in basso ----------
function showTab(tab, silent) {
  if (!TABS.includes(tab)) tab = 'oggi';
  document.querySelectorAll('[data-tab]').forEach(el => {
    const on = el.dataset.tab === tab;
    el.classList.toggle('hidden', !on);
    el.classList.toggle('flex', on);
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.go === tab));
  try { localStorage.setItem('crew_tab', tab); } catch (e) { /* niente */ }
  // se ero già sceso sotto la testata, riparto dall'inizio della scheda
  const top = document.getElementById('main').offsetTop - 8;
  if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  if (!silent && navigator.vibrate) navigator.vibrate([8]);
}

// ---------- Testata: data e numero dell'edizione ----------
function renderMasthead() {
  const now = new Date();
  document.getElementById('mast-date').innerText =
    now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const issue = Math.max(1, Math.floor((now - CREW_FIRST_ISSUE) / 86400000) + 1);
  document.getElementById('mast-issue').innerText = issue;
}

// ---------- Ultim'ora: le notizie fresche che scorrono ----------
let lastTicker = '';
function updateTicker() {
  const items = [];
  const nameOf = id => (getMember(id) || { name: id }).name;

  // capitolo del Libro Nero in corso
  if (typeof libroCurrent === 'function' && libroCurrent()) {
    const s = libroCurrent();
    items.push(`📖 Libro Nero: "${s.title}" a ${libroLines(s.id).length}/${s.max_lines} righe`);
  }
  // votazione in corso
  if (typeof fantaIsActive === 'function' && fantaIsActive()) items.push(`🗳️ Votazione aperta: ${fantaEvent.name}`);
  // segnalazioni delle ultime 24 ore
  (typeof segnalazioni !== 'undefined' ? segnalazioni : [])
    .filter(s => new Date(s.created_at).getTime() > Date.now() - 86400000)
    .slice(0, 5)
    .forEach(s => items.push(`📣 ${nameOf(s.author_id)}: ${s.text}`));
  // azioni rapide recenti
  (typeof recentActions !== 'undefined' ? recentActions : [])
    .slice(0, 6)
    .forEach(a => {
      const t = ACTION_TYPES[a.type];
      const time = new Date(a.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      items.push(`${nameOf(a.member_id)} · ${t ? t.label : a.type} alle ${time}`);
    });
  // leader del Fanta Figa
  if (typeof ffEntries !== 'undefined' && ffEntries.length) {
    const counts = {};
    ffEntries.forEach(e => { counts[e.member_id] = (counts[e.member_id] || 0) + 1; });
    const [leader, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    items.push(`🏆 Fanta Figa: comanda ${nameOf(leader)} con ${n}`);
  }
  if (items.length === 0) items.push('Nessuna notizia. Troppo silenzio, è sospetto.', 'Scrivete qualcosa in "Oggi vi segnalo".');

  const text = items.join('   ✦   ');
  if (text === lastTicker) return;
  lastTicker = text;
  const el = document.getElementById('ticker-text');
  el.innerText = text;
  el.style.setProperty('--dur', Math.max(18, text.length / 7) + 's');
  // riparte l'animazione con il testo nuovo
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

document.addEventListener('DOMContentLoaded', () => {
  renderMasthead();
  initSupabase();
  renderOnline([]);

  let tab = 'oggi';
  try { tab = localStorage.getItem('crew_tab') || 'oggi'; } catch (e) { /* niente */ }
  showTab(tab, true);

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
  initLibro();

  updateTicker();
  setInterval(updateTicker, 4000);
});
