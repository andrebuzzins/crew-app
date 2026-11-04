// Fanta Figa: conteggio per persona in un periodo (dal... al...).
// Ognuno registra i propri eventi, con un feedback facoltativo.
const FF_KINDS = {
  scopata: { label: 'Scopata', plural: 'Scopate',  emoji: '🔥' },
  pompino: { label: 'Pompino', plural: 'Pompini',  emoji: '👄' },
  sega:    { label: 'Sega',    plural: 'Seghe',    emoji: '✊' },
  limone:  { label: 'Limone',  plural: 'Limoni',   emoji: '🍋' },
};
const FF_SHOW_ENDED_DAYS = 7; // per quanti giorni resta visibile la classifica finale

let ffPeriod = null;
let ffEntries = [];
let ffSelectedKind = null;
let ffForceSetup = false;

// Date in formato YYYY-MM-DD secondo l'ora italiana del telefono.
const ffToday = () => new Date().toLocaleDateString('sv-SE');
const ffAddDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const ffFmt = iso => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
const ffActive = () => ffPeriod && ffPeriod.starts_on <= ffToday() && ffToday() <= ffPeriod.ends_on;
const ffNotStarted = () => ffPeriod && ffToday() < ffPeriod.starts_on;

async function initFantaFiga() {
  document.getElementById('ff-from').value = ffToday();
  document.getElementById('ff-to').value = ffAddDays(ffToday(), 30);
  renderFantaFiga();
  if (!supa) return;

  const { data } = await supa.from('ff_periods').select('*')
    .gte('ends_on', ffAddDays(ffToday(), -FF_SHOW_ENDED_DAYS))
    .order('created_at', { ascending: false }).limit(1);
  if (data && data[0]) await ffSetPeriod(data[0]);

  supa.channel('fantafiga')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ff_periods' }, p => {
      if (ffPeriod && ffPeriod.id === p.new.id) return;
      ffSetPeriod(p.new, []);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ff_entries' }, p => {
      const e = p.new;
      if (!ffPeriod || e.period_id !== ffPeriod.id || ffEntries.some(x => x.id === e.id)) return;
      ffEntries.unshift(e);
      renderFantaFiga();
      if (me && e.member_id !== me.id) {
        const m = getMember(e.member_id);
        const k = FF_KINDS[e.kind];
        showToast(`${m ? m.name : e.member_id}: ${k.emoji} ${k.label}!`, m && m.avatar, m && m.pos);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'ff_entries' }, p => {
      ffEntries = ffEntries.filter(x => x.id !== p.old.id);
      renderFantaFiga();
    })
    .subscribe();
}

async function ffSetPeriod(period, entries) {
  ffPeriod = period;
  ffForceSetup = false;
  if (entries) ffEntries = entries;
  else {
    const { data } = await supa.from('ff_entries').select('*')
      .eq('period_id', period.id).order('created_at', { ascending: false });
    ffEntries = data || [];
  }
  renderFantaFiga();
}

async function creaPeriodoFF() {
  if (!me) return showWhoAmI();
  if (!supa) return showToast('Non collegato a Supabase');
  const name = document.getElementById('ff-name').value;
  const from = document.getElementById('ff-from').value;
  const to = document.getElementById('ff-to').value;
  if (!from || !to || to < from) return showToast('Controlla le date', me.avatar);
  const { data, error } = await supa.rpc('create_ff_period', { p_name: name, p_from: from, p_to: to, p_by: me.id });
  if (error) {
    if ((error.message || '').includes('PERIODO_IN_CORSO')) showToast("C'è già un Fanta Figa in corso", me.avatar);
    else { console.error(error); showToast('Errore, riprova', me.avatar); }
    return;
  }
  document.getElementById('ff-name').value = '';
  await ffSetPeriod(data, []);
}

function nuovoPeriodoFF() { ffForceSetup = true; renderFantaFiga(); }

function scegliKindFF(kind) {
  ffSelectedKind = ffSelectedKind === kind ? null : kind;
  renderFantaFiga();
  if (ffSelectedKind) document.getElementById('ff-feedback').focus();
}

async function registraFF() {
  if (!me) return showWhoAmI();
  if (!ffSelectedKind || !ffActive()) return;
  const fb = document.getElementById('ff-feedback').value.trim();
  const { data, error } = await supa.from('ff_entries')
    .insert({ period_id: ffPeriod.id, member_id: me.id, kind: ffSelectedKind, feedback: fb || null })
    .select().single();
  if (error) {
    showToast((error.message || '').includes('PERIODO_CHIUSO') ? 'Il periodo è chiuso' : 'Errore, riprova', me.avatar);
    console.error(error);
    return;
  }
  if (navigator.vibrate) navigator.vibrate([30]);
  if (!ffEntries.some(x => x.id === data.id)) ffEntries.unshift(data);
  showToast(`Registrato: ${FF_KINDS[data.kind].emoji} ${FF_KINDS[data.kind].label}`, me.avatar);
  ffSelectedKind = null;
  renderFantaFiga();
}

async function eliminaFF(id) {
  if (!confirm('Eliminare questo evento?')) return;
  const { error } = await supa.from('ff_entries').delete().eq('id', id);
  if (error) { console.error(error); return showToast('Errore, riprova', me && me.avatar); }
  ffEntries = ffEntries.filter(x => x.id !== id);
  renderFantaFiga();
}

function renderFantaFiga() {
  const setup = document.getElementById('ff-setup');
  const main = document.getElementById('ff-main');
  if (!setup) return;
  const showSetup = !ffPeriod || (ffForceSetup && !ffActive());
  setup.classList.toggle('hidden', !showSetup);
  main.classList.toggle('hidden', showSetup);
  if (showSetup) return;

  // Titolo e stato del periodo
  const active = ffActive();
  document.getElementById('ff-title').innerText = ffPeriod.name;
  let status;
  if (active) {
    const left = Math.round((new Date(ffPeriod.ends_on + 'T12:00:00') - new Date(ffToday() + 'T12:00:00')) / 86400000);
    status = `dal ${ffFmt(ffPeriod.starts_on)} al ${ffFmt(ffPeriod.ends_on)} · ${left === 0 ? 'ultimo giorno!' : `mancano ${left} giorni`}`;
  } else if (ffNotStarted()) {
    status = `inizia il ${ffFmt(ffPeriod.starts_on)} · finisce il ${ffFmt(ffPeriod.ends_on)}`;
  } else {
    status = `concluso il ${ffFmt(ffPeriod.ends_on)} · classifica finale`;
  }
  document.getElementById('ff-status').innerText = status;

  // Classifica con conteggi per tipo
  const rows = window.CREW_MEMBERS.map(m => {
    const mine = ffEntries.filter(e => e.member_id === m.id);
    const counts = {};
    Object.keys(FF_KINDS).forEach(k => { counts[k] = mine.filter(e => e.kind === k).length; });
    return { m, counts, total: mine.length };
  }).sort((a, b) => b.total - a.total);
  const medals = ['🥇', '🥈', '🥉'];
  document.getElementById('ff-table').innerHTML = `
    <div class="grid grid-cols-[1fr_repeat(5,1.6rem)] gap-x-0.5 items-center text-center text-[11px] font-bold text-gray-400 px-2">
      <span></span>${Object.values(FF_KINDS).map(k => `<span title="${k.plural}">${k.emoji}</span>`).join('')}<span>TOT</span>
    </div>` + rows.map((r, i) => `
    <div class="grid grid-cols-[1fr_repeat(5,1.6rem)] gap-x-0.5 items-center text-center bg-black bg-opacity-40 p-2 rounded-2xl border border-white border-opacity-10">
      <div class="flex items-center gap-2 text-left min-w-0">
        <img src="${r.m.avatar}" style="${avatarPos(r.m)}" class="w-8 h-8 rounded-full object-cover border border-gray-500 flex-shrink-0">
        <span class="font-bold text-sm text-white truncate">${r.total > 0 && medals[i] ? medals[i] + ' ' : ''}${r.m.name}</span>
      </div>
      ${Object.keys(FF_KINDS).map(k => `<span class="font-clash font-bold ${r.counts[k] ? 'text-white' : 'text-gray-600'}">${r.counts[k]}</span>`).join('')}
      <span class="font-clash font-extrabold text-pink-400">${r.total}</span>
    </div>`).join('');

  // Registrazione (solo durante il periodo)
  const reg = document.getElementById('ff-register');
  reg.classList.toggle('hidden', !active);
  document.getElementById('ff-new-period').classList.toggle('hidden', active || ffNotStarted());
  if (active) {
    document.getElementById('ff-kinds').innerHTML = Object.entries(FF_KINDS).map(([k, v]) => `
      <button onclick="scegliKindFF('${k}')" class="btn-score rounded-2xl py-3 flex flex-col items-center gap-1 ${ffSelectedKind === k ? '!bg-pink-700 !border-pink-300' : ''}">
        <span class="text-2xl">${v.emoji}</span><span class="text-[11px] font-bold">${v.label}</span>
      </button>`).join('');
    document.getElementById('ff-feedback-box').classList.toggle('hidden', !ffSelectedKind);
    if (ffSelectedKind) document.getElementById('ff-feedback-label').innerText = `${FF_KINDS[ffSelectedKind].emoji} ${FF_KINDS[ffSelectedKind].label} · feedback (facoltativo)`;
  }

  // Storico eventi con feedback
  const log = document.getElementById('ff-log');
  log.innerHTML = ffEntries.length === 0
    ? '<p class="text-sm text-gray-500 text-center">Ancora niente da registrare.</p>'
    : ffEntries.map(e => {
      const m = getMember(e.member_id) || { name: e.member_id };
      const k = FF_KINDS[e.kind];
      const when = new Date(e.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const canDelete = me && e.member_id === me.id;
      return `
      <div class="bg-black bg-opacity-40 rounded-2xl p-3 border border-white border-opacity-10">
        <div class="flex items-center gap-2 text-sm">
          <span class="font-bold text-white">${m.name}</span>
          <span class="text-gray-300">${k.emoji} ${k.label}</span>
          <span class="text-[11px] text-gray-500 ml-auto">${when}</span>
          ${canDelete ? `<button onclick="eliminaFF('${e.id}')" class="text-gray-500 hover:text-red-400 text-xs" title="Elimina"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>
        ${e.feedback ? `<p class="text-sm text-gray-300 italic mt-1 break-words">“${escapeHtml(e.feedback)}”</p>` : ''}
      </div>`;
    }).join('');
}
