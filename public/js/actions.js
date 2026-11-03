// Azioni Rapide condivise + bacheca "Ultime 6 ore".
const ACTION_TYPES = {
  barleo:   { label: 'Barleo',        icon: 'fa-beer-mug-empty', color: 'text-orange-400' },
  scopando: { label: 'Sto scopando.', icon: 'fa-fire',           color: 'text-blue-400' },
};
const FEED_HOURS = 6;         // dopo quante ore un'azione sparisce dalla bacheca
const COOLDOWN_MIN = 5;       // deve combaciare con supabase/01_actions.sql

let recentActions = [];       // azioni delle ultime FEED_HOURS ore, più recenti prima

async function initActions() {
  renderFeed();
  setInterval(renderFeed, 60 * 1000); // ogni minuto toglie quelle troppo vecchie
  if (!supa) return;

  const since = new Date(Date.now() - FEED_HOURS * 3600 * 1000).toISOString();
  const { data, error } = await supa
    .from('actions')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (error) console.error('Errore lettura azioni', error);
  else recentActions = data;
  renderFeed();

  // Quando qualcuno preme un'azione, arriva qui su tutti i telefoni.
  supa.channel('actions-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'actions' }, payload => {
      const a = payload.new;
      if (recentActions.some(x => x.id === a.id)) return;
      recentActions.unshift(a);
      renderFeed();
      if (!me || a.member_id !== me.id) showActionToast(a);
    })
    .subscribe();
}

async function triggerAction(btn, type) {
  if (!me) return showWhoAmI();
  const icon = btn.querySelector('i');
  icon.classList.add('scale-125');
  setTimeout(() => icon.classList.remove('scale-125'), 150);

  // Controllo veloce lato telefono (il database lo ricontrolla comunque).
  const mine = recentActions.find(a => a.member_id === me.id && a.type === type);
  if (mine) {
    const left = COOLDOWN_MIN * 60000 - (Date.now() - new Date(mine.created_at).getTime());
    if (left > 0) return showToast(`Calma! Riprova tra ${Math.ceil(left / 60000)} min`, me.avatar);
  }

  if (navigator.vibrate) navigator.vibrate([30]);

  if (!supa) return showToast('Non collegato a Supabase', me.avatar);
  const { data, error } = await supa
    .from('actions')
    .insert({ type, member_id: me.id })
    .select()
    .single();

  if (error) {
    if ((error.message || '').includes('COOLDOWN')) showToast(`Calma! Aspetta ${COOLDOWN_MIN} min tra un'azione e l'altra`, me.avatar);
    else { console.error(error); showToast('Errore, riprova', me.avatar); }
    return;
  }
  if (!recentActions.some(x => x.id === data.id)) recentActions.unshift(data);
  renderFeed();
  showToast(`Inviato a tutti: ${ACTION_TYPES[type].label}`, me.avatar);
}

// Bacheca in alto: chi ha premuto cosa e a che ora.
function renderFeed() {
  const cutoff = Date.now() - FEED_HOURS * 3600 * 1000;
  recentActions = recentActions.filter(a => new Date(a.created_at).getTime() >= cutoff);

  const box = document.getElementById('feed-list');
  if (!box) return;
  if (recentActions.length === 0) {
    box.innerHTML = `<p class="text-sm text-gray-400 font-semibold text-center py-2">Tutto tranquillo nelle ultime ${FEED_HOURS} ore.</p>`;
    return;
  }
  box.innerHTML = recentActions.map(a => {
    const m = getMember(a.member_id) || { name: a.member_id, avatar: '' };
    const t = ACTION_TYPES[a.type] || { label: a.type, icon: 'fa-bolt', color: 'text-white' };
    const time = new Date(a.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="flex items-center gap-3 bg-black bg-opacity-40 p-2 pr-3 rounded-2xl border border-white border-opacity-10">
        <img src="${m.avatar}" class="w-9 h-9 rounded-full object-cover border border-gray-500">
        <div class="flex-1 min-w-0">
          <span class="font-bold text-white">${m.name}</span>
          <span class="text-sm text-gray-300"> · <i class="fa-solid ${t.icon} ${t.color}"></i> ${t.label}</span>
        </div>
        <span class="font-clash font-bold text-sm text-gray-300">${time}</span>
      </div>`;
  }).join('');
}

// Banner in alto quando qualcun altro preme un'azione.
function showActionToast(a) {
  const m = getMember(a.member_id) || { name: a.member_id, avatar: '' };
  const t = ACTION_TYPES[a.type] || { label: a.type };
  showToast(`${m.name}: ${t.label}`, m.avatar);
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

let toastTimer;
function showToast(text, avatar) {
  const el = document.getElementById('toast');
  document.getElementById('toast-text').innerText = text;
  const img = document.getElementById('toast-img');
  img.src = avatar || '';
  img.classList.toggle('hidden', !avatar);
  el.classList.remove('-translate-y-40', 'opacity-0');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('-translate-y-40', 'opacity-0'), 4000);
}
