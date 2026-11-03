// Monitoraggio Sfide condiviso: ogni +/- salva il progresso e una riga di storico.
const SFIDA_STEP = 10; // di quanto cambia la percentuale a ogni tocco
const SFIDA_COLORS = [
  { bar: 'from-orange-500 to-red-600',    badge: 'bg-orange-900 border-orange-500 text-orange-300' },
  { bar: 'from-cyan-500 to-blue-600',     badge: 'bg-blue-900 border-blue-500 text-blue-300' },
  { bar: 'from-green-500 to-emerald-600', badge: 'bg-green-900 border-green-500 text-green-300' },
  { bar: 'from-pink-500 to-purple-600',   badge: 'bg-purple-900 border-purple-500 text-purple-300' },
];

let sfide = [];
const sfideLastUpdate = {}; // challenge_id -> ultimo aggiornamento

async function initSfide() {
  // menu persone nel form "nuova sfida"
  document.getElementById('sfida-member').innerHTML =
    window.CREW_MEMBERS.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  renderSfide();
  if (!supa) return;

  const [{ data: ch }, { data: ups }] = await Promise.all([
    supa.from('challenges').select('*').order('created_at', { ascending: true }),
    supa.from('challenge_updates').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
  sfide = ch || [];
  (ups || []).forEach(u => { if (!sfideLastUpdate[u.challenge_id]) sfideLastUpdate[u.challenge_id] = u; });
  renderSfide();

  supa.channel('sfide')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, p => {
      const c = p.new;
      if (!c || !c.id) return;
      const i = sfide.findIndex(x => x.id === c.id);
      if (i >= 0) sfide[i] = c; else sfide.push(c);
      renderSfide();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'challenge_updates' }, p => {
      sfideLastUpdate[p.new.challenge_id] = p.new;
      renderSfide();
    })
    .subscribe();
}

function toggleSfidaForm() {
  document.getElementById('sfida-form').classList.toggle('hidden');
}

async function creaSfida() {
  if (!me) return showWhoAmI();
  if (!supa) return showToast('Non collegato a Supabase');
  const member_id = document.getElementById('sfida-member').value;
  const title = document.getElementById('sfida-title').value.trim();
  const total_days = parseInt(document.getElementById('sfida-days').value, 10);
  if (!title || !(total_days > 0)) return showToast('Scrivi obiettivo e giorni', me.avatar);

  const { data, error } = await supa.from('challenges')
    .insert({ member_id, title, total_days, created_by: me.id }).select().single();
  if (error) { console.error(error); return showToast('Errore, riprova', me.avatar); }
  if (!sfide.some(x => x.id === data.id)) sfide.push(data);
  document.getElementById('sfida-title').value = '';
  document.getElementById('sfida-days').value = '';
  toggleSfidaForm();
  renderSfide();
}

async function aggiornaSfida(id, delta) {
  if (!me) return showWhoAmI();
  if (navigator.vibrate) navigator.vibrate([20]);
  const { data, error } = await supa.rpc('update_challenge', { p_id: id, p_by: me.id, p_delta: delta });
  if (error) { console.error(error); return showToast('Errore, riprova', me.avatar); }
  const i = sfide.findIndex(x => x.id === id);
  if (i >= 0) sfide[i] = data;
  sfideLastUpdate[id] = { challenge_id: id, author_id: me.id, delta_pct: delta, created_at: new Date().toISOString() };
  renderSfide();
}

function renderSfide() {
  const box = document.getElementById('sfide-list');
  if (sfide.length === 0) {
    box.innerHTML = `<p class="col-span-2 text-sm text-gray-400 font-semibold text-center py-4">Nessuna sfida. Tocca + per lanciarne una.</p>`;
    return;
  }
  box.innerHTML = sfide.map((c, i) => {
    const col = SFIDA_COLORS[i % SFIDA_COLORS.length];
    const m = getMember(c.member_id) || { name: c.member_id };
    const elapsed = Math.floor((Date.now() - new Date(c.start_date + 'T00:00:00').getTime()) / 86400000);
    const left = Math.max(0, c.total_days - elapsed);
    const u = sfideLastUpdate[c.id];
    const uBy = u && getMember(u.author_id);
    const uText = u ? `${uBy ? uBy.name : u.author_id} ${u.delta_pct > 0 ? '+' : ''}${u.delta_pct}% · ${new Date(u.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}` : 'Nessun aggiornamento';
    return `
      <div class="glass-card p-4 flex flex-col gap-3 bg-opacity-80">
        <div class="flex justify-between items-start gap-1">
          <h3 class="font-clash font-bold text-lg text-white">${m.name}</h3>
          <span class="text-[10px] font-bold ${col.badge} bg-opacity-60 border px-2 py-1 rounded-md whitespace-nowrap">${left} GG</span>
        </div>
        <p class="text-xs font-semibold text-gray-300 leading-tight">Obiettivo: ${escapeHtml(c.title)}</p>
        <div class="mt-auto flex flex-col gap-1">
          <div class="flex justify-between text-[10px] font-bold text-gray-400"><span>${escapeHtml(uText)}</span><span class="text-white">${c.progress_pct}%</span></div>
          <div class="w-full bg-black bg-opacity-50 rounded-full h-2.5 shadow-inner border border-white border-opacity-10">
            <div class="bg-gradient-to-r ${col.bar} h-2.5 rounded-full transition-all" style="width: ${c.progress_pct}%"></div>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="aggiornaSfida('${c.id}', -${SFIDA_STEP})" class="btn-score flex-1 h-8 rounded-xl text-sm font-bold text-red-400">-${SFIDA_STEP}%</button>
          <button onclick="aggiornaSfida('${c.id}', ${SFIDA_STEP})" class="btn-score flex-1 h-8 rounded-xl text-sm font-bold text-green-400">+${SFIDA_STEP}%</button>
        </div>
      </div>`;
  }).join('');
}
