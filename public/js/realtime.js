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

// "La redazione" in testata: una polaroid per membro, a colori chi è online.
const POLAROID_TILT = [-4, 3, -2, 4, -3, 2, -1];
function renderOnline(ids) {
  const box = document.getElementById('online-list');
  box.innerHTML = window.CREW_MEMBERS.map((m, i) => {
    const on = ids.includes(m.id);
    return `
      <div class="polaroid ${on ? '' : 'off'}" style="--r:${POLAROID_TILT[i % POLAROID_TILT.length]}deg" title="${m.name}${on ? ' · online' : ''}">
        <img src="${m.avatar}" alt="${m.name}" style="${avatarPos(m)}">
        <span>${m.name}</span>
        ${on ? '<i class="on-dot"></i>' : ''}
      </div>`;
  }).join('');
  document.getElementById('online-count').innerText = ids.length + ' online';
}
