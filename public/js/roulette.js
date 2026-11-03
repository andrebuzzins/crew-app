// La Roulette condivisa: estrae il database, l'animazione parte su tutti i telefoni.
let isSpinning = false;
const animatedSpins = new Set();

async function initRoulette() {
  if (!supa) return;
  const { data } = await supa.from('roulette_results').select('*')
    .order('created_at', { ascending: false }).limit(1);
  if (data && data[0]) {
    animatedSpins.add(data[0].id);
    showRouletteResult(data[0], false);
  }

  supa.channel('roulette')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'roulette_results' },
      p => animateRoulette(p.new))
    .subscribe();
}

async function startRoulette() {
  if (isSpinning) return;
  if (!me) return showWhoAmI();
  if (!supa) return showToast('Non collegato a Supabase');
  const { data, error } = await supa.rpc('spin_roulette', {
    p_by: me.id,
    p_members: window.CREW_MEMBERS.map(m => m.id),
  });
  if (error) {
    if ((error.message || '').includes('GIA_IN_CORSO')) showToast('Sta già girando!', me.avatar);
    else { console.error(error); showToast('Errore, riprova', me.avatar); }
    return;
  }
  animateRoulette(data);
}

function animateRoulette(result) {
  if (animatedSpins.has(result.id)) return; // già animata (arriva sia dalla risposta sia dal realtime)
  animatedSpins.add(result.id);
  if (isSpinning) return;

  const names = window.CREW_MEMBERS.map(m => m.name);
  const resultEl = document.getElementById('roulette-result');
  document.getElementById('roulette-by').innerText = '';
  if (navigator.vibrate) navigator.vibrate([20, 50, 20]);

  isSpinning = true;
  let spinCount = 0;
  const maxSpins = 25;
  resultEl.style.filter = 'blur(1px)';
  resultEl.style.transform = 'scale(1.05)';

  const interval = setInterval(() => {
    resultEl.innerText = names[Math.floor(Math.random() * names.length)];
    if (navigator.vibrate && spinCount % 2 === 0) navigator.vibrate([10]);
    spinCount++;
    if (spinCount >= maxSpins) {
      clearInterval(interval);
      showRouletteResult(result, true);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      setTimeout(() => {
        resultEl.style.transform = 'scale(1)';
        resultEl.style.color = '';
        isSpinning = false;
      }, 500);
    }
  }, 80);
}

function showRouletteResult(result, highlight) {
  const resultEl = document.getElementById('roulette-result');
  const picked = getMember(result.picked_member_id);
  const by = getMember(result.triggered_by);
  resultEl.innerText = picked ? picked.name : result.picked_member_id;
  resultEl.style.filter = 'blur(0px)';
  if (highlight) {
    resultEl.style.transform = 'scale(1.1)';
    resultEl.style.color = '#ec4899';
  }
  const time = new Date(result.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('roulette-by').innerText = `Tirata da ${by ? by.name : result.triggered_by} alle ${time}`;
}
