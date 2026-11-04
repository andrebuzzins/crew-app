// Profilo scelto su questo dispositivo ("Chi sei?"), salvato nel browser.
const SESSION_KEY = 'crew_member_id';

function getMember(id) {
  return window.CREW_MEMBERS.find(m => m.id === id) || null;
}

// Stile per inquadrare il viso nelle foto tonde.
function avatarPos(m) {
  return m && m.pos ? `object-position: ${m.pos};` : '';
}

// Per mostrare testo scritto dagli utenti senza rompere la pagina.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getCurrentMember() {
  try {
    return getMember(localStorage.getItem(SESSION_KEY));
  } catch (e) {
    return null;
  }
}

function setCurrentMember(id) {
  try { localStorage.setItem(SESSION_KEY, id); } catch (e) { /* modalità privata: pazienza */ }
}

// Disegna la schermata "Chi sei?" con un bottone per ogni membro.
function renderWhoAmI() {
  const grid = document.getElementById('whoami-grid');
  grid.innerHTML = '';
  window.CREW_MEMBERS.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'btn-3d h-[150px] flex flex-col items-start justify-end p-3 gap-1 !border-[var(--paper)] !shadow-[6px_6px_0_var(--hot)]';
    btn.style.backgroundImage = `linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0) 60%), url('${m.avatar}')`;
    btn.style.backgroundSize = 'cover';
    btn.style.backgroundPosition = m.pos || 'center';
    btn.innerHTML = `<span class="headline text-3xl leading-none">${m.name}</span>`;
    btn.onclick = () => chooseMember(m.id);
    grid.appendChild(btn);
  });
}

function showWhoAmI() {
  renderWhoAmI();
  document.getElementById('whoami').classList.remove('hidden');
  document.getElementById('whoami').classList.add('flex');
}

function hideWhoAmI() {
  document.getElementById('whoami').classList.add('hidden');
  document.getElementById('whoami').classList.remove('flex');
}

function chooseMember(id) {
  if (navigator.vibrate) navigator.vibrate([30]);
  setCurrentMember(id);
  hideWhoAmI();
  window.onMemberChosen(getMember(id));
}
