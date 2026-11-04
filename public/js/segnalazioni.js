// "Oggi vi segnalo:" + Archivio.
// Ogni segnalazione resta 7 giorni, oppure per sempre se qualcuno tocca il lucchetto.
// La pulizia vera la fa il database (cleanup_segnalazioni), qui nascondiamo quelle scadute.
const SEGN_DAYS = 7;
const SEGN_TODAY_HOURS = 24; // quante ore restano anche nel riquadro in alto

let segnalazioni = []; // più recenti prima

const segnVisible = s => s.keep_forever || new Date(s.created_at).getTime() > Date.now() - SEGN_DAYS * 86400000;

async function initSegnalazioni() {
  renderSegnalazioni();
  setInterval(renderSegnalazioni, 5 * 60 * 1000);
  if (!supa) return;

  supa.rpc('cleanup_segnalazioni').then(() => {}); // toglie quelle scadute (senza aspettare)
  const { data, error } = await supa.from('segnalazioni').select('*')
    .order('created_at', { ascending: false }).limit(300);
  if (error) console.error(error);
  segnalazioni = data || [];
  renderSegnalazioni();

  supa.channel('segnalazioni')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'segnalazioni' }, p => {
      if (segnalazioni.some(x => x.id === p.new.id)) return;
      segnalazioni.unshift(p.new);
      renderSegnalazioni();
      if (me && p.new.author_id !== me.id) {
        const m = getMember(p.new.author_id);
        showToast(`📣 ${m ? m.name : 'Qualcuno'}: ${p.new.text}`, m && m.avatar, m && m.pos);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'segnalazioni' }, p => {
      const i = segnalazioni.findIndex(x => x.id === p.new.id);
      if (i >= 0) { segnalazioni[i] = p.new; renderSegnalazioni(); }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'segnalazioni' }, p => {
      segnalazioni = segnalazioni.filter(x => x.id !== p.old.id);
      renderSegnalazioni();
    })
    .subscribe();
}

async function inviaSegnalazione() {
  if (!me) return showWhoAmI();
  if (!supa) return showToast('Non collegato a Supabase');
  const input = document.getElementById('segn-text');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const { data, error } = await supa.from('segnalazioni').insert({ author_id: me.id, text }).select().single();
  if (error) { console.error(error); input.value = text; return showToast('Errore, riprova', me.avatar); }
  if (navigator.vibrate) navigator.vibrate([30]);
  if (!segnalazioni.some(x => x.id === data.id)) segnalazioni.unshift(data);
  renderSegnalazioni();
}

async function toggleForever(id) {
  const s = segnalazioni.find(x => x.id === id);
  if (!s) return;
  const { error } = await supa.from('segnalazioni').update({ keep_forever: !s.keep_forever }).eq('id', id);
  if (error) { console.error(error); return showToast('Errore, riprova', me && me.avatar); }
  s.keep_forever = !s.keep_forever;
  showToast(s.keep_forever ? '🔒 Tenuta per sempre' : `🔓 Sparirà dopo ${SEGN_DAYS} giorni`, me && me.avatar);
  renderSegnalazioni();
}

async function eliminaSegnalazione(id) {
  if (!confirm('Eliminare questa segnalazione?')) return;
  const { error } = await supa.from('segnalazioni').delete().eq('id', id);
  if (error) { console.error(error); return showToast('Errore, riprova', me && me.avatar); }
  segnalazioni = segnalazioni.filter(x => x.id !== id);
  renderSegnalazioni();
}

function segnCard(s, withActions) {
  const m = getMember(s.author_id) || { name: s.author_id, avatar: '' };
  const when = new Date(s.created_at).toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const daysLeft = Math.max(0, Math.ceil((new Date(s.created_at).getTime() + SEGN_DAYS * 86400000 - Date.now()) / 86400000));
  return `
    <div class="flex gap-3 items-start bg-black bg-opacity-40 p-3 rounded-2xl border border-white border-opacity-10">
      <img src="${m.avatar}" style="${avatarPos(m)}" class="w-9 h-9 rounded-full object-cover border border-gray-500 flex-shrink-0">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-bold text-white text-sm">${m.name}</span>
          <span class="text-[10px] text-gray-500">${when}</span>
        </div>
        <p class="text-sm text-gray-200 font-medium break-words">${escapeHtml(s.text)}</p>
        ${withActions ? `<p class="text-[10px] font-bold mt-1 ${s.keep_forever ? 'text-yellow-400' : 'text-gray-500'}">${s.keep_forever ? '🔒 Per sempre' : `Sparisce tra ${daysLeft} gg`}</p>` : ''}
      </div>
      ${withActions ? `
      <div class="flex flex-col gap-2 flex-shrink-0">
        <button onclick="toggleForever('${s.id}')" class="w-8 h-8 rounded-full border ${s.keep_forever ? 'bg-yellow-500 bg-opacity-30 border-yellow-400 text-yellow-300' : 'bg-white bg-opacity-10 border-white border-opacity-20 text-gray-400'} flex items-center justify-center active:scale-90 transition-transform" title="Tieni per sempre">
          <i class="fa-solid ${s.keep_forever ? 'fa-lock' : 'fa-lock-open'} text-xs"></i>
        </button>
        <button onclick="eliminaSegnalazione('${s.id}')" class="w-8 h-8 rounded-full bg-red-900 bg-opacity-50 border border-red-500 border-opacity-50 text-red-400 flex items-center justify-center active:scale-90 transition-transform" title="Elimina">
          <i class="fa-solid fa-trash text-xs"></i>
        </button>
      </div>` : ''}
    </div>`;
}

function renderSegnalazioni() {
  const visible = segnalazioni.filter(segnVisible);

  // Riquadro in alto: ultime 24 ore
  const today = visible.filter(s => new Date(s.created_at).getTime() > Date.now() - SEGN_TODAY_HOURS * 3600000);
  document.getElementById('segn-today').innerHTML = today.map(s => segnCard(s, false)).join('');

  // Archivio completo
  const box = document.getElementById('archivio-list');
  box.innerHTML = visible.length === 0
    ? `<p class="text-sm text-gray-400 font-semibold text-center py-4">Archivio vuoto. Le segnalazioni restano qui ${SEGN_DAYS} giorni, o per sempre col 🔒.</p>`
    : visible.map(s => segnCard(s, true)).join('');
}
