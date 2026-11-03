// Serate + Archivio.
// Il collegamento di azioni / Fanta Figa / roulette alla serata aperta lo fa il database.
const SERATA_MAX_HOURS = 12; // deve combaciare con supabase/03_serate.sql

let serate = [];                 // tutte le serate, più recenti prima
const serataDetails = {};        // id -> dettagli già caricati
const serataOpen = new Set();    // card aperte nell'archivio

const isSerataOpen = s => !s.ended_at && new Date(s.started_at).getTime() > Date.now() - SERATA_MAX_HOURS * 3600 * 1000;
const currentSerata = () => serate.find(isSerataOpen) || null;

async function initSerate() {
  renderSerate();
  setInterval(renderSerataBar, 60 * 1000);
  if (!supa) return;

  const { data, error } = await supa.from('serate').select('*')
    .order('started_at', { ascending: false }).limit(50);
  if (error) console.error(error);
  serate = data || [];
  renderSerate();

  supa.channel('serate')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'serate' }, p => {
      const s = p.new;
      if (!s || !s.id) return;
      const i = serate.findIndex(x => x.id === s.id);
      const isNew = i < 0;
      if (isNew) serate.unshift(s); else serate[i] = s;
      delete serataDetails[s.id];
      renderSerate();
      if (me && (s.created_by !== me.id) && isNew) {
        const by = getMember(s.created_by);
        showToast(`${by ? by.name : 'Qualcuno'} ha aperto la serata: ${s.name}`, by && by.avatar, by && by.pos);
      }
      if (me && s.closed_by && s.closed_by !== me.id && !isNew) {
        const by = getMember(s.closed_by);
        showToast(`${by ? by.name : 'Qualcuno'} ha chiuso la serata`, by && by.avatar, by && by.pos);
      }
    })
    .subscribe();
}

async function apriSerata() {
  if (!me) return showWhoAmI();
  if (!supa) return showToast('Non collegato a Supabase');
  const name = document.getElementById('serata-name').value;
  const { data, error } = await supa.rpc('open_serata', { p_name: name, p_by: me.id });
  if (error) {
    if ((error.message || '').includes('SERATA_GIA_APERTA')) showToast("C'è già una serata aperta", me.avatar);
    else { console.error(error); showToast('Errore, riprova', me.avatar); }
    return;
  }
  if (navigator.vibrate) navigator.vibrate([30]);
  document.getElementById('serata-name').value = '';
  if (!serate.some(x => x.id === data.id)) serate.unshift(data);
  renderSerate();
}

async function chiudiSerata() {
  if (!me) return showWhoAmI();
  if (!confirm('Chiudere la serata? Finirà nell\'archivio.')) return;
  const { data, error } = await supa.rpc('close_serata', { p_by: me.id });
  if (error) { console.error(error); return showToast('Errore, riprova', me.avatar); }
  const i = serate.findIndex(x => x.id === data.id);
  if (i >= 0) serate[i] = data;
  delete serataDetails[data.id];
  renderSerate();
}

function renderSerate() {
  renderSerataBar();
  renderArchivio();
}

const hhmm = d => new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const ddmm = d => new Date(d).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });

// Riquadro in alto: serata in corso oppure "Apri serata".
function renderSerataBar() {
  const s = currentSerata();
  const openBox = document.getElementById('serata-open');
  const closedBox = document.getElementById('serata-closed');
  if (s) {
    openBox.classList.remove('hidden');
    closedBox.classList.add('hidden');
    const by = getMember(s.created_by);
    document.getElementById('serata-title').innerText = s.name;
    document.getElementById('serata-info').innerText =
      `Aperta da ${by ? by.name : s.created_by} alle ${hhmm(s.started_at)} · tutto quello che fate finisce in archivio`;
  } else {
    openBox.classList.add('hidden');
    closedBox.classList.remove('hidden');
  }
}

// Archivio in fondo: una card per serata, si apre toccandola.
function renderArchivio() {
  const box = document.getElementById('archivio-list');
  if (serate.length === 0) {
    box.innerHTML = `<p class="text-sm text-gray-400 font-semibold text-center py-4">Ancora nessuna serata. Aprine una in alto.</p>`;
    return;
  }
  box.innerHTML = serate.map(s => {
    const open = isSerataOpen(s);
    const expanded = serataOpen.has(s.id);
    return `
      <div class="glass-card p-4 flex flex-col gap-3">
        <button onclick="toggleSerata('${s.id}')" class="flex items-center justify-between text-left w-full">
          <div>
            <h3 class="font-clash font-bold text-lg text-white">${escapeHtml(s.name)}</h3>
            <p class="text-[11px] font-bold text-gray-400 uppercase tracking-wider">${ddmm(s.started_at)} · ${hhmm(s.started_at)}${s.ended_at ? '–' + hhmm(s.ended_at) : ''}</p>
          </div>
          <div class="flex items-center gap-2">
            ${open ? '<span class="text-[10px] font-bold bg-green-900 bg-opacity-60 border border-green-500 text-green-300 px-2 py-1 rounded-md">IN CORSO</span>' : ''}
            <i class="fa-solid fa-chevron-${expanded ? 'up' : 'down'} text-gray-400"></i>
          </div>
        </button>
        ${expanded ? `<div id="serata-det-${s.id}" class="flex flex-col gap-4">${serataDetails[s.id] ? renderSerataDetails(serataDetails[s.id]) : '<p class="text-sm text-gray-400">Carico…</p>'}</div>` : ''}
      </div>`;
  }).join('');
}

async function toggleSerata(id) {
  if (serataOpen.has(id)) serataOpen.delete(id); else serataOpen.add(id);
  renderArchivio();
  if (serataOpen.has(id)) {
    // per la serata in corso ricarico sempre, per le altre basta una volta
    const s = serate.find(x => x.id === id);
    if (!serataDetails[id] || (s && isSerataOpen(s))) {
      serataDetails[id] = await loadSerataDetails(id);
      renderArchivio();
    }
  }
}

async function loadSerataDetails(id) {
  const [fanta, actions, roulette] = await Promise.all([
    supa.from('fanta_events').select('id, name, created_at, fanta_votes(target_id, score)')
      .eq('serata_id', id).order('created_at'),
    supa.from('actions').select('member_id, type').eq('serata_id', id),
    supa.from('roulette_results').select('picked_member_id, triggered_by, created_at')
      .eq('serata_id', id).order('created_at'),
  ]);
  return { fanta: fanta.data || [], actions: actions.data || [], roulette: roulette.data || [] };
}

function renderSerataDetails(d) {
  const sectionTitle = t => `<p class="text-xs font-bold uppercase tracking-widest text-gray-400">${t}</p>`;
  const nameOf = id => (getMember(id) || { name: id }).name;
  let html = '';

  // Fanta Figa: classifica di ogni evento
  html += `<div class="flex flex-col gap-2">${sectionTitle('Fanta Figa')}`;
  if (d.fanta.length === 0) html += `<p class="text-sm text-gray-500">Nessun evento.</p>`;
  d.fanta.forEach(ev => {
    const rows = window.CREW_MEMBERS.map(m => {
      const vs = (ev.fanta_votes || []).filter(v => v.target_id === m.id);
      return { m, avg: vs.length ? vs.reduce((a, v) => a + v.score, 0) / vs.length : null };
    }).filter(r => r.avg !== null).sort((a, b) => b.avg - a.avg);
    const medals = ['🥇', '🥈', '🥉'];
    html += `<div class="bg-black bg-opacity-40 rounded-2xl p-3 border border-white border-opacity-10">
      <p class="font-bold text-blue-400 mb-1">${escapeHtml(ev.name)} <span class="text-[11px] text-gray-500">${hhmm(ev.created_at)}</span></p>
      ${rows.length === 0 ? '<p class="text-sm text-gray-500">Nessun voto.</p>' : rows.map((r, i) =>
        `<div class="flex justify-between text-sm"><span>${medals[i] || '·'} ${r.m.name}</span><span class="font-bold text-white">${r.avg.toFixed(1)}</span></div>`).join('')}
    </div>`;
  });
  html += `</div>`;

  // Azioni rapide: conteggio per persona
  html += `<div class="flex flex-col gap-2">${sectionTitle('Azioni rapide')}`;
  const counted = window.CREW_MEMBERS.map(m => ({
    m,
    barleo: d.actions.filter(a => a.member_id === m.id && a.type === 'barleo').length,
    scopando: d.actions.filter(a => a.member_id === m.id && a.type === 'scopando').length,
  })).filter(r => r.barleo + r.scopando > 0);
  if (counted.length === 0) html += `<p class="text-sm text-gray-500">Nessuna azione.</p>`;
  else html += `<div class="bg-black bg-opacity-40 rounded-2xl p-3 border border-white border-opacity-10 flex flex-col gap-1">` +
    counted.map(r => `<div class="flex justify-between text-sm"><span>${r.m.name}</span><span class="text-gray-300">
      <i class="fa-solid fa-beer-mug-empty text-orange-400"></i> ${r.barleo} &nbsp; <i class="fa-solid fa-fire text-blue-400"></i> ${r.scopando}</span></div>`).join('') + `</div>`;
  html += `</div>`;

  // Roulette
  html += `<div class="flex flex-col gap-2">${sectionTitle('Roulette')}`;
  if (d.roulette.length === 0) html += `<p class="text-sm text-gray-500">Nessuna estrazione.</p>`;
  else html += `<div class="bg-black bg-opacity-40 rounded-2xl p-3 border border-white border-opacity-10 flex flex-col gap-1">` +
    d.roulette.map(r => `<div class="flex justify-between text-sm"><span>🎲 <b class="text-pink-400">${nameOf(r.picked_member_id)}</b> <span class="text-gray-500">(tirata da ${nameOf(r.triggered_by)})</span></span><span class="text-gray-400">${hhmm(r.created_at)}</span></div>`).join('') + `</div>`;
  html += `</div>`;

  return html;
}
