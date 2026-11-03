// Radar IG: persone con nome scelto a mano + commenti del gruppo.
// Si possono eliminare sia i commenti sia le persone (con i loro commenti).
const RADAR_COLORS = ['bg-blue-600', 'bg-pink-600', 'bg-orange-600', 'bg-green-600', 'bg-purple-600', 'bg-cyan-600'];

let radarTargets = [];          // più recenti prima
let radarNotes = [];            // tutti i commenti
const radarExpanded = new Set();

async function initRadar() {
  renderRadar();
  if (!supa) return;

  const [{ data: t }, { data: n }] = await Promise.all([
    supa.from('radar_targets').select('*').order('created_at', { ascending: false }),
    supa.from('radar_notes').select('*').order('created_at', { ascending: true }),
  ]);
  radarTargets = t || [];
  radarNotes = n || [];
  if (radarTargets[0]) radarExpanded.add(radarTargets[0].id);
  renderRadar();

  supa.channel('radar')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'radar_targets' }, p => {
      if (radarTargets.some(x => x.id === p.new.id)) return;
      radarTargets.unshift(p.new);
      renderRadar();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'radar_targets' }, p => {
      radarTargets = radarTargets.filter(x => x.id !== p.old.id);
      radarNotes = radarNotes.filter(x => x.target_id !== p.old.id);
      renderRadar();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'radar_notes' }, p => {
      if (radarNotes.some(x => x.id === p.new.id)) return;
      radarNotes.push(p.new);
      renderRadar();
      if (me && p.new.author_id !== me.id) {
        const by = getMember(p.new.author_id);
        const t = radarTargets.find(x => x.id === p.new.target_id);
        showToast(`${by ? by.name : 'Qualcuno'} su ${t ? t.name : 'Radar'}: ${p.new.text}`, by && by.avatar, by && by.pos);
      }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'radar_notes' }, p => {
      radarNotes = radarNotes.filter(x => x.id !== p.old.id);
      renderRadar();
    })
    .subscribe();
}

function toggleRadarForm() {
  document.getElementById('radar-form').classList.toggle('hidden');
  document.getElementById('radar-name').focus();
}

async function aggiungiRadar() {
  if (!me) return showWhoAmI();
  if (!supa) return showToast('Non collegato a Supabase');
  const name = document.getElementById('radar-name').value.trim();
  if (!name) return showToast('Scrivi un nome', me.avatar);
  const { data, error } = await supa.from('radar_targets')
    .insert({ name, created_by: me.id }).select().single();
  if (error) { console.error(error); return showToast('Errore, riprova', me.avatar); }
  if (!radarTargets.some(x => x.id === data.id)) radarTargets.unshift(data);
  radarExpanded.add(data.id);
  document.getElementById('radar-name').value = '';
  document.getElementById('radar-form').classList.add('hidden');
  renderRadar();
}

async function eliminaRadar(id) {
  const t = radarTargets.find(x => x.id === id);
  if (!confirm(`Eliminare "${t ? t.name : ''}" e tutti i suoi commenti?`)) return;
  const { error } = await supa.from('radar_targets').delete().eq('id', id);
  if (error) { console.error(error); return showToast('Errore, riprova', me && me.avatar); }
  radarTargets = radarTargets.filter(x => x.id !== id);
  radarNotes = radarNotes.filter(x => x.target_id !== id);
  renderRadar();
}

async function inviaNota(targetId) {
  if (!me) return showWhoAmI();
  const input = document.getElementById('radar-input-' + targetId);
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const { data, error } = await supa.from('radar_notes')
    .insert({ target_id: targetId, author_id: me.id, text }).select().single();
  if (error) { console.error(error); input.value = text; return showToast('Errore, riprova', me.avatar); }
  if (!radarNotes.some(x => x.id === data.id)) radarNotes.push(data);
  renderRadar();
}

async function eliminaNota(id) {
  if (!confirm('Eliminare questo commento?')) return;
  const { error } = await supa.from('radar_notes').delete().eq('id', id);
  if (error) { console.error(error); return showToast('Errore, riprova', me && me.avatar); }
  radarNotes = radarNotes.filter(x => x.id !== id);
  renderRadar();
}

function toggleRadar(id) {
  if (radarExpanded.has(id)) radarExpanded.delete(id); else radarExpanded.add(id);
  renderRadar();
}

function renderRadar() {
  const box = document.getElementById('radar-list');
  if (!box) return;
  // non ridisegnare mentre qualcuno sta scrivendo un commento (perderebbe il testo)
  const typing = document.activeElement && document.activeElement.id && document.activeElement.id.startsWith('radar-input-')
    ? { id: document.activeElement.id, value: document.activeElement.value } : null;

  if (radarTargets.length === 0) {
    box.innerHTML = `<div class="glass-card p-5"><p class="text-sm text-gray-400 font-semibold text-center">Radar vuoto. Tocca + per aggiungere qualcuno.</p></div>`;
    return;
  }

  box.innerHTML = radarTargets.map((t, i) => {
    const notes = radarNotes.filter(n => n.target_id === t.id);
    const open = radarExpanded.has(t.id);
    const by = getMember(t.created_by);
    const last = notes[notes.length - 1];
    const color = RADAR_COLORS[i % RADAR_COLORS.length];
    return `
    <div class="glass-card p-5 flex flex-col gap-4 relative overflow-hidden" style="background-image: linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.9)), url('img/bg-radar.jpeg'); background-size: cover; background-position: center;">
      <div class="flex items-center gap-4">
        <button onclick="toggleRadar('${t.id}')" class="flex items-center gap-4 flex-1 min-w-0 text-left">
          <div class="w-14 h-14 rounded-full ${color} border-2 border-gray-400 shadow-md flex items-center justify-center font-clash font-extrabold text-2xl text-white flex-shrink-0">
            ${escapeHtml(t.name.replace(/^@/, '').charAt(0).toUpperCase())}
          </div>
          <div class="min-w-0">
            <h3 class="font-bold text-xl tracking-tight text-white drop-shadow-md truncate">${escapeHtml(t.name)}</h3>
            <span class="text-[10px] font-semibold px-2 py-1 bg-black bg-opacity-60 border border-white border-opacity-20 rounded-md text-blue-400 uppercase">
              ${notes.length} comment${notes.length === 1 ? 'o' : 'i'} · da ${by ? by.name : t.created_by}
            </span>
          </div>
        </button>
        <button onclick="eliminaRadar('${t.id}')" class="w-9 h-9 rounded-full bg-red-900 bg-opacity-50 border border-red-500 border-opacity-50 text-red-400 flex items-center justify-center active:scale-90 transition-transform flex-shrink-0" title="Elimina persona">
          <i class="fa-solid fa-trash text-sm"></i>
        </button>
      </div>

      ${!open ? (last ? `<p class="text-sm text-gray-400 truncate -mt-1">${escapeHtml((getMember(last.author_id) || { name: last.author_id }).name)}: ${escapeHtml(last.text)}</p>` : '') : `
      <div class="flex flex-col gap-3 max-h-64 overflow-y-auto pr-1">
        ${notes.length === 0 ? '<p class="text-sm text-gray-500 text-center">Ancora nessun commento.</p>' : notes.map(n => {
          const a = getMember(n.author_id) || { name: n.author_id, avatar: '' };
          const mine = me && n.author_id === me.id;
          const time = new Date(n.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          return `
          <div class="flex gap-3 items-start ${mine ? 'flex-row-reverse text-right' : ''}">
            <img src="${a.avatar}" style="${avatarPos(a)}" class="w-8 h-8 rounded-full object-cover shadow-sm border border-gray-600 flex-shrink-0">
            <div class="glass-input px-3 py-2 rounded-2xl ${mine ? 'rounded-tr-none' : 'rounded-tl-none'} flex-1 min-w-0">
              <div class="flex items-center gap-2 ${mine ? 'flex-row-reverse' : ''}">
                <span class="text-[10px] font-bold ${mine ? 'text-orange-400' : 'text-blue-400'} uppercase drop-shadow-sm">${a.name}</span>
                <span class="text-[10px] text-gray-500">${time}</span>
                <button onclick="eliminaNota('${n.id}')" class="text-gray-500 hover:text-red-400 text-xs ${mine ? 'mr-auto' : 'ml-auto'}" title="Elimina commento"><i class="fa-solid fa-xmark"></i></button>
              </div>
              <p class="text-sm text-gray-200 font-medium break-words">${escapeHtml(n.text)}</p>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="flex gap-2">
        <input id="radar-input-${t.id}" type="text" maxlength="500" placeholder="Aggiungi un commento..." onkeydown="if(event.key==='Enter') inviaNota('${t.id}')" class="glass-input flex-1 min-w-0 rounded-xl px-4 py-2 text-sm font-semibold">
        <button onclick="inviaNota('${t.id}')" class="w-10 h-10 rounded-xl bg-blue-600 bg-opacity-80 border border-blue-400 text-white shadow-lg active:scale-95 transition-transform flex justify-center items-center flex-shrink-0">
          <i class="fa-solid fa-paper-plane text-sm"></i>
        </button>
      </div>`}
    </div>`;
  }).join('');

  if (typing) {
    const el = document.getElementById(typing.id);
    if (el) { el.value = typing.value; el.focus(); }
  }
}
