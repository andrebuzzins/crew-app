// Connessione a Supabase e "chi è online" (Presence).
// Se config.js non ha ancora le chiavi, l'app funziona lo stesso in locale.
let supa = null;
let presenceChannel = null;

function initSupabase() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.CREW_CONFIG;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
    console.warn('Supabase non configurato: modalità solo locale.');
    return null;
  }
  supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supa;
}

// Entra nel canale "online" con il proprio profilo e aggiorna la lista di chi c'è.
async function startPresence(member) {
  if (!supa) {
    renderOnline([member.id]);
    return;
  }
  if (presenceChannel) await supa.removeChannel(presenceChannel);

  presenceChannel = supa.channel('crew-online', {
    config: { presence: { key: member.id } },
  });

  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      renderOnline(Object.keys(presenceChannel.presenceState()));
    })
    .subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({ member: member.id, at: new Date().toISOString() });
      }
    });
}

// Mostra le facce di chi è online sotto il titolo.
function renderOnline(ids) {
  const box = document.getElementById('online-list');
  box.innerHTML = '';
  window.CREW_MEMBERS.forEach(m => {
    const on = ids.includes(m.id);
    const img = document.createElement('img');
    img.src = m.avatar;
    img.alt = m.name;
    img.title = m.name + (on ? ' (online)' : ' (offline)');
    img.className = 'w-7 h-7 rounded-full object-cover border-2 transition-all ' +
      (on ? 'border-green-400 opacity-100' : 'border-gray-700 opacity-30 grayscale');
    box.appendChild(img);
  });
  const count = document.getElementById('online-count');
  count.innerText = ids.length + ' online';
}
