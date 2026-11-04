// "Voto della serata" (tabelle fanta_events / fanta_votes, il vecchio Fanta Figa).
// Regole: ognuno vota gli altri (non se stesso) da 1 a 10. Il timer è calcolato da
// ends_at salvato nel database, quindi è uguale su tutti i telefoni. A tempo scaduto
// il database rifiuta i voti e si vede la classifica con la media.
const FANTA_SHOW_RESULTS_HOURS = 12; // per quanto resta visibile l'ultima classifica

let fantaEvent = null;      // evento corrente (o ultimo concluso)
let fantaVotes = [];        // voti dell'evento corrente
let fantaWasActive = false;
let fantaForceSetup = false;
const fantaPending = {};    // timer per non salvare a ogni singolo tocco

const fantaIsActive = () => fantaEvent && new Date(fantaEvent.ends_at).getTime() > Date.now();

async function initFanta() {
  renderFanta();
  setInterval(fantaTick, 500);
  if (!supa) return;

  const { data } = await supa.from('fanta_events').select('*')
    .order('created_at', { ascending: false }).limit(1);
  const last = data && data[0];
  if (last && new Date(last.ends_at).getTime() > Date.now() - FANTA_SHOW_RESULTS_HOURS * 3600 * 1000) {
    await setFantaEvent(last);
  }

  supa.channel('fanta')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fanta_events' }, p => {
      if (fantaEvent && fantaEvent.id === p.new.id) return;
      setFantaEvent(p.new, []);
      const by = getMember(p.new.created_by);
      if (!me || p.new.created_by !== me.id) {
        showToast(`${by ? by.name : 'Qualcuno'} ha aperto il Voto della serata: ${p.new.name}`, by && by.avatar, by && by.pos);
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fanta_votes' }, p => {
      const v = p.new;
      if (!v || !fantaEvent || v.event_id !== fantaEvent.id) return;
      // i miei voti li ho già aggiornati sul telefono
      if (me && v.voter_id === me.id) return;
      upsertLocalVote(v);
      renderFanta();
    })
    .subscribe();
}

async function setFantaEvent(ev, votes) {
  fantaEvent = ev;
  fantaForceSetup = false;
  fantaWasActive = fantaIsActive();
  if (votes) fantaVotes = votes;
  else {
    const { data } = await supa.from('fanta_votes').select('*').eq('event_id', ev.id);
    fantaVotes = data || [];
  }
  renderFanta();
}

function upsertLocalVote(v) {
  const i = fantaVotes.findIndex(x => x.voter_id === v.voter_id && x.target_id === v.target_id);
  if (i >= 0) fantaVotes[i] = v; else fantaVotes.push(v);
}

function myVote(targetId) {
  const v = me && fantaVotes.find(x => x.voter_id === me.id && x.target_id === targetId);
  return v ? v.score : null;
}

async function creaEventoFanta() {
  if (!me) return showWhoAmI();
  if (!supa) return showToast('Non collegato a Supabase');
  const name = document.getElementById('fanta-event-name').value;
  const seconds = parseInt(document.getElementById('fanta-duration').value, 10);
  const { data, error } = await supa.rpc('create_fanta_event', { p_name: name, p_by: me.id, p_seconds: seconds });
  if (error) {
    if ((error.message || '').includes('EVENTO_IN_CORSO')) showToast("C'è già un evento in corso", me.avatar);
    else { console.error(error); showToast('Errore, riprova', me.avatar); }
    return;
  }
  if (navigator.vibrate) navigator.vibrate([30]);
  document.getElementById('fanta-event-name').value = '';
  await setFantaEvent(data, []);
}

function updateScore(targetId, change) {
  if (!me || !fantaIsActive()) return;
  const current = myVote(targetId) ?? 5;              // si parte da 5
  const next = myVote(targetId) === null && change === 0 ? 5 : Math.min(10, Math.max(1, current + change));
  upsertLocalVote({ event_id: fantaEvent.id, voter_id: me.id, target_id: targetId, score: next });
  renderFanta();
  if (navigator.vibrate) navigator.vibrate(change > 0 ? [15, 30, 15] : [40]);

  clearTimeout(fantaPending[targetId]);
  fantaPending[targetId] = setTimeout(async () => {
    const { error } = await supa.from('fanta_votes').upsert(
      { event_id: fantaEvent.id, voter_id: me.id, target_id: targetId, score: next },
      { onConflict: 'event_id,voter_id,target_id' });
    if (error) {
      console.error(error);
      showToast((error.message || '').includes('TEMPO_SCADUTO') ? 'Tempo scaduto!' : 'Voto non salvato', me.avatar);
    }
  }, 300);
}

function nuovoEventoFanta() {
  fantaForceSetup = true;
  renderFanta();
}

// Aggiorna il timer; quando scade passa alla classifica.
function fantaTick() {
  if (!fantaEvent) return;
  const left = Math.max(0, Math.ceil((new Date(fantaEvent.ends_at).getTime() - Date.now()) / 1000));
  const el = document.getElementById('fanta-timer');
  if (el && left > 0) {
    el.innerText = left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : left + 's';
    el.classList.toggle('animate-pulse', left <= 10);
  }
  if (fantaWasActive && left === 0) {
    fantaWasActive = false;
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    renderFanta();
  }
}

function renderFanta() {
  const setup = document.getElementById('fanta-setup');
  const grid = document.getElementById('fanta-grid');
  const results = document.getElementById('fanta-results');
  const show = el => { el.classList.remove('hidden'); el.classList.add('flex'); };
  const hide = el => { el.classList.add('hidden'); el.classList.remove('flex'); };

  if (!fantaEvent || (fantaForceSetup && !fantaIsActive())) {
    show(setup); hide(grid); hide(results);
    return;
  }

  if (fantaIsActive()) {
    hide(setup); show(grid); hide(results);
    document.getElementById('fanta-event-title').innerText = fantaEvent.name;
    const voters = new Set(fantaVotes.map(v => v.voter_id));
    document.getElementById('fanta-voters').innerText = `Hanno votato: ${voters.size}/${window.CREW_MEMBERS.length}`;

    const box = document.getElementById('fanta-players');
    const others = window.CREW_MEMBERS.filter(m => !me || m.id !== me.id);
    box.innerHTML = others.map(m => {
      const s = myVote(m.id);
      return `
      <div class="flex items-center justify-between bg-black bg-opacity-40 p-3 rounded-2xl shadow-sm border border-white border-opacity-10 backdrop-blur-md">
        <div class="flex items-center gap-3 w-28">
          <img src="${m.avatar}" style="${avatarPos(m)}" class="w-10 h-10 rounded-full object-cover border border-gray-400">
          <span class="font-bold text-lg text-white">${m.name}</span>
        </div>
        <div class="flex items-center gap-4">
          <button onclick="updateScore('${m.id}', -1)" class="btn-score w-10 h-10 rounded-full text-xl font-bold text-red-400">-</button>
          <button onclick="updateScore('${m.id}', 0)" class="font-clash text-2xl font-extrabold w-8 text-center drop-shadow-md ${s === null ? 'text-gray-500' : 'text-white'}">${s ?? '5'}</button>
          <button onclick="updateScore('${m.id}', 1)" class="btn-score w-10 h-10 rounded-full text-xl font-bold text-green-400">+</button>
        </div>
      </div>`;
    }).join('') + `<p class="text-[11px] text-gray-400 text-center">Grigio = non ancora votato. Tocca il numero per dare 5.</p>`;
    return;
  }

  // Evento concluso: classifica con media voti.
  hide(setup); hide(grid); show(results);
  const rows = window.CREW_MEMBERS.map(m => {
    const vs = fantaVotes.filter(v => v.target_id === m.id);
    const avg = vs.length ? vs.reduce((a, v) => a + v.score, 0) / vs.length : null;
    return { m, avg, n: vs.length };
  }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  const medals = ['🥇', '🥈', '🥉', ''];
  document.getElementById('fanta-results-title').innerText = fantaEvent.name;
  document.getElementById('fanta-results-list').innerHTML = rows.map((r, i) => `
    <div class="flex items-center gap-3 bg-black bg-opacity-40 p-3 rounded-2xl border border-white border-opacity-10">
      <span class="w-6 text-center text-lg">${r.avg === null ? '' : (medals[i] || '')}</span>
      <img src="${r.m.avatar}" style="${avatarPos(r.m)}" class="w-10 h-10 rounded-full object-cover border border-gray-400">
      <span class="font-bold text-lg text-white flex-1">${r.m.name}</span>
      <span class="text-[11px] text-gray-400">${r.n} voti</span>
      <span class="font-clash text-2xl font-extrabold text-white w-12 text-right">${r.avg === null ? '–' : r.avg.toFixed(1)}</span>
    </div>`).join('');
}
