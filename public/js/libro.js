// IL LIBRO NERO: storia a catena ("cadavere squisito").
// Si vede solo l'ultima riga, le altre sono censurate. Non si scrivono due righe di fila.
// Arrivati a max_lines (o con "Chiudi e rivela") il capitolo esce per intero.
const LIBRO_INCIPIT = [
  'Era sabato notte e {A} aveva appena giurato che non avrebbe bevuto.',
  'Nessuno sa come, ma alle 3 di notte {A} e {B} si ritrovarono in mezzo a una rotonda.',
  'Il telefono di {A} vibrò: un messaggio che avrebbe cambiato tutto.',
  '{A} entrò nel bar con una sola missione, e non era bere.',
  'Quella sera la crew fece un patto: nessuno avrebbe mai raccontato cosa successe a {A}.',
  'Tutto iniziò quando {A} disse: "Fidatevi, conosco una scorciatoia."',
  '{A} si svegliò in un posto che non aveva mai visto, con addosso la giacca di {B}.',
  'La serata era morta, finché {A} non tirò fuori dalla tasca qualcosa di inaspettato.',
  'Alle 23:47 {A} scrisse sul gruppo: "Ragazzi, ho fatto una cazzata."',
  'Il buttafuori guardò {A} negli occhi e disse una sola parola.',
  '{A} e {B} avevano un piano perfetto. Il problema era {C}.',
  'Dicono che quella notte {A} abbia visto qualcosa nel parcheggio del Conad.',
];

let libroStorie = [];            // tutti i capitoli, più recenti prima
let libroRighe = [];             // tutte le righe
const libroOpenChapters = new Set();

const libroCurrent = () => libroStorie.find(s => !s.closed_at) || null;
const libroLines = id => libroRighe.filter(r => r.story_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));

async function initLibro() {
  renderLibro();
  if (!supa) return;

  const [{ data: st }, { data: rg }] = await Promise.all([
    supa.from('libro_storie').select('*').order('created_at', { ascending: false }),
    supa.from('libro_righe').select('*').order('created_at', { ascending: true }),
  ]);
  libroStorie = st || [];
  libroRighe = rg || [];
  const lastClosed = libroStorie.find(s => s.closed_at);
  if (lastClosed) libroOpenChapters.add(lastClosed.id);
  renderLibro();

  supa.channel('libro')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'libro_storie' }, p => {
      if (libroStorie.some(x => x.id === p.new.id)) return;
      libroStorie.unshift(p.new);
      renderLibro();
      if (me && p.new.created_by !== me.id) {
        const m = getMember(p.new.created_by);
        showToast(`📖 ${m ? m.name : 'Qualcuno'} ha aperto un capitolo: ${p.new.title}`, m && m.avatar, m && m.pos);
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'libro_storie' }, p => {
      const i = libroStorie.findIndex(x => x.id === p.new.id);
      const wasOpen = i >= 0 && !libroStorie[i].closed_at;
      if (i >= 0) libroStorie[i] = p.new; else libroStorie.unshift(p.new);
      if (wasOpen && p.new.closed_at) {
        libroOpenChapters.add(p.new.id);
        showToast(`📰 È uscito il capitolo "${p.new.title}"! Leggilo nel Libro Nero`);
        if (navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 160]);
      }
      renderLibro();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'libro_storie' }, p => {
      libroStorie = libroStorie.filter(x => x.id !== p.old.id);
      libroRighe = libroRighe.filter(x => x.story_id !== p.old.id);
      renderLibro();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'libro_righe' }, p => {
      if (libroRighe.some(x => x.id === p.new.id)) return;
      libroRighe.push(p.new);
      renderLibro();
      if (me && p.new.author_id !== me.id) {
        const m = getMember(p.new.author_id);
        showToast(`✍️ ${m ? m.name : 'Qualcuno'} ha scritto nel Libro Nero. Tocca a te!`, m && m.avatar, m && m.pos);
      }
    })
    .subscribe();
}

// Inizio a caso con i nomi della crew.
function ispiramiLibro() {
  const names = window.CREW_MEMBERS.map(m => m.name).sort(() => Math.random() - 0.5);
  const tpl = LIBRO_INCIPIT[Math.floor(Math.random() * LIBRO_INCIPIT.length)];
  document.getElementById('libro-first').value = tpl.replace('{A}', names[0]).replace('{B}', names[1]).replace('{C}', names[2]);
  if (navigator.vibrate) navigator.vibrate([15]);
}

async function nuovoCapitolo() {
  if (!me) return showWhoAmI();
  if (!supa) return showToast('Non collegato a Supabase');
  const title = document.getElementById('libro-title').value.trim();
  const first = document.getElementById('libro-first').value.trim();
  const max = parseInt(document.getElementById('libro-max').value, 10);
  if (!title) return showToast('Dai un titolo al capitolo', me.avatar);
  if (!first) return showToast('Scrivi la prima riga (o tocca 🎲)', me.avatar);
  const { data, error } = await supa.rpc('libro_nuovo', { p_title: title, p_by: me.id, p_max: max, p_first: first });
  if (error) {
    showToast((error.message || '').includes('CAPITOLO_APERTO') ? "C'è già un capitolo aperto" : 'Errore, riprova', me.avatar);
    console.error(error);
    return;
  }
  document.getElementById('libro-title').value = '';
  document.getElementById('libro-first').value = '';
  if (!libroStorie.some(x => x.id === data.id)) libroStorie.unshift(data);
  // la prima riga arriva anche dal tempo reale; la ricarico per sicurezza
  const { data: rows } = await supa.from('libro_righe').select('*').eq('story_id', data.id);
  (rows || []).forEach(r => { if (!libroRighe.some(x => x.id === r.id)) libroRighe.push(r); });
  if (navigator.vibrate) navigator.vibrate([30]);
  renderLibro();
}

async function aggiungiRiga() {
  if (!me) return showWhoAmI();
  const s = libroCurrent();
  const input = document.getElementById('libro-next');
  if (!s || !input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const { data, error } = await supa.from('libro_righe')
    .insert({ story_id: s.id, author_id: me.id, text }).select().single();
  if (error) {
    input.value = text;
    const msg = error.message || '';
    showToast(msg.includes('NON_DUE_DI_FILA') ? 'Aspetta che scriva qualcun altro!' : msg.includes('CAPITOLO_CHIUSO') ? 'Il capitolo è appena uscito!' : 'Errore, riprova', me.avatar);
    console.error(error);
    return;
  }
  if (!libroRighe.some(x => x.id === data.id)) libroRighe.push(data);
  if (navigator.vibrate) navigator.vibrate([30]);
  showToast('Riga aggiunta. Ora è un segreto 🤐', me.avatar);
  renderLibro();
}

async function chiudiCapitolo() {
  const s = libroCurrent();
  if (!s) return;
  if (!confirm('Chiudere il capitolo e rivelarlo a tutti?')) return;
  const { error } = await supa.rpc('libro_chiudi', { p_id: s.id });
  if (error) {
    showToast((error.message || '').includes('TROPPO_CORTO') ? 'Servono almeno 3 righe' : 'Errore, riprova', me && me.avatar);
    console.error(error);
  }
}

async function eliminaCapitolo(id) {
  const s = libroStorie.find(x => x.id === id);
  if (!confirm(`Eliminare il capitolo "${s ? s.title : ''}"?`)) return;
  const { error } = await supa.from('libro_storie').delete().eq('id', id);
  if (error) { console.error(error); return showToast('Errore, riprova', me && me.avatar); }
  libroStorie = libroStorie.filter(x => x.id !== id);
  libroRighe = libroRighe.filter(x => x.story_id !== id);
  renderLibro();
}

function toggleCapitolo(id) {
  if (libroOpenChapters.has(id)) libroOpenChapters.delete(id); else libroOpenChapters.add(id);
  renderLibro();
}

// Larghezza "casuale ma fissa" delle strisce di censura.
function libroBarWidth(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997;
  return 45 + (h % 50);
}

function libroAvatar(id, size = 'w-6 h-6') {
  const m = getMember(id) || { name: id, avatar: '' };
  return `<img src="${m.avatar}" style="${avatarPos(m)}" title="${m.name}" class="${size} rounded-full object-cover border-2 border-[#111] inline-block">`;
}

function renderLibro() {
  const openBox = document.getElementById('libro-open');
  const newBox = document.getElementById('libro-new');
  if (!openBox) return;

  // non perdere quello che si sta scrivendo
  const typing = document.getElementById('libro-next');
  const draft = typing ? typing.value : '';
  const hadFocus = typing && document.activeElement === typing;

  const s = libroCurrent();
  newBox.classList.toggle('hidden', !!s);
  openBox.classList.toggle('hidden', !s);
  updateLibroBadge();

  if (s) {
    const lines = libroLines(s.id);
    const last = lines[lines.length - 1];
    const lastAuthor = last && (getMember(last.author_id) || { name: last.author_id });
    const myTurn = me && last && last.author_id !== me.id;
    const segments = Array.from({ length: s.max_lines }, (_, i) => {
      const r = lines[i];
      return r ? `<div class="flex-1 h-2 bg-[var(--hot)]"></div>` : `<div class="flex-1 h-2 bg-white/15"></div>`;
    }).join('');

    openBox.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="kicker text-[var(--acid)]">Capitolo in corso</p>
          <h3 class="headline text-3xl leading-none text-white break-words">${escapeHtml(s.title)}</h3>
        </div>
        <div class="text-right flex-shrink-0">
          <p class="headline text-3xl leading-none text-white">${lines.length}<span class="text-white/40">/${s.max_lines}</span></p>
          <p class="kicker text-white/50">righe</p>
        </div>
      </div>
      <div class="flex gap-1">${segments}</div>
      <div class="flex items-center gap-1 flex-wrap">
        <span class="kicker text-white/50 mr-1">Hanno scritto:</span>
        ${lines.map(r => libroAvatar(r.author_id)).join('<span class="text-white/30 text-xs">›</span>')}
      </div>

      <div class="flex flex-col gap-2 py-1">
        ${lines.slice(0, -1).map(r => `<div class="redact" style="width:${libroBarWidth(r.id)}%"></div>`).join('')}
        ${lines.length > 1 ? `<p class="kicker text-white/40">${lines.length - 1} righe censurate</p>` : ''}
      </div>

      ${last ? `
      <div class="slip">
        <p class="kicker text-[var(--hot)] mb-1">L'ultima riga · di ${lastAuthor.name}</p>
        <p class="font-serif text-lg leading-snug text-[#111]">…${escapeHtml(last.text)}</p>
      </div>` : ''}

      ${myTurn ? `
      <div class="flex flex-col gap-2">
        <textarea id="libro-next" maxlength="240" rows="3" placeholder="Continua la storia… (vedranno tutto solo alla fine)" oninput="document.getElementById('libro-count').innerText = this.value.length + '/240'" class="glass-input rounded-xl px-4 py-3 text-base font-semibold w-full resize-none"></textarea>
        <div class="flex items-center gap-2">
          <span id="libro-count" class="kicker text-white/40 flex-1">0/240</span>
          <button onclick="aggiungiRiga()" class="btn-ink btn-hot px-5 py-3">Aggiungi la tua riga ✍️</button>
        </div>
      </div>` : `
      <p class="text-sm text-white/70 font-semibold text-center py-2">${me ? "🤐 Hai scritto tu l'ultima riga. Ora tocca a qualcun altro." : 'Scegli chi sei per scrivere.'}</p>`}

      ${lines.length >= 3 ? `<button onclick="chiudiCapitolo()" class="kicker text-white/50 underline underline-offset-4 self-center py-1">Chiudi e rivela adesso</button>` : ''}`;

    const again = document.getElementById('libro-next');
    if (again && draft) {
      again.value = draft;
      document.getElementById('libro-count').innerText = draft.length + '/240';
    }
    if (again && hadFocus) again.focus();
  }

  // Capitoli usciti
  const closed = libroStorie.filter(x => x.closed_at);
  document.getElementById('libro-chapters').innerHTML = closed.length === 0
    ? `<p class="text-sm text-[#111]/60 font-semibold text-center py-4">Nessun capitolo uscito. Il primo lo scrivete voi.</p>`
    : closed.map((c, idx) => {
      const lines = libroLines(c.id);
      const authors = [...new Set(lines.map(r => r.author_id))];
      const open = libroOpenChapters.has(c.id);
      const date = new Date(c.closed_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
      return `
      <article class="article">
        <button onclick="toggleCapitolo('${c.id}')" class="w-full text-left flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <p class="kicker text-[var(--hot)]">Capitolo ${closed.length - idx} · ${date} · ${lines.length} righe</p>
            <i class="fa-solid fa-chevron-${open ? 'up' : 'down'} text-[#111]/40"></i>
          </div>
          <h3 class="headline text-3xl leading-[0.95] text-[#111] break-words">${escapeHtml(c.title)}</h3>
          <div class="flex items-center gap-1">
            <span class="kicker text-[#111]/50 mr-1">Di</span>
            ${authors.map(a => libroAvatar(a, 'w-7 h-7')).join('')}
          </div>
        </button>
        ${open ? `
        <div class="font-serif text-[17px] leading-relaxed text-[#111] mt-3 dropcap">
          ${lines.map(r => {
            const m = getMember(r.author_id) || { name: r.author_id };
            return `<span class="libro-line" title="${m.name}">${escapeHtml(r.text)}</span>`;
          }).join(' ')}
        </div>
        <div class="mt-3 pt-3 border-t-2 border-[#111] flex flex-col gap-1.5">
          <p class="kicker text-[#111]/50">Chi ha scritto cosa</p>
          ${lines.map((r, i) => `
            <div class="flex items-start gap-2 text-xs text-[#111]/80">
              ${libroAvatar(r.author_id, 'w-5 h-5')}
              <span><b>${i + 1}.</b> ${escapeHtml(r.text)}</span>
            </div>`).join('')}
          <button onclick="eliminaCapitolo('${c.id}')" class="kicker text-[#111]/40 self-end mt-2"><i class="fa-solid fa-trash"></i> Elimina capitolo</button>
        </div>` : ''}
      </article>`;
    }).join('');
}

// Pallino rosso sulla scheda "Libro" quando c'è un capitolo in cui puoi scrivere.
function updateLibroBadge() {
  const dot = document.getElementById('nav-libro-dot');
  if (!dot) return;
  const s = libroCurrent();
  const lines = s ? libroLines(s.id) : [];
  const last = lines[lines.length - 1];
  dot.classList.toggle('hidden', !(s && me && last && last.author_id !== me.id));
}
