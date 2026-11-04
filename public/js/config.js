// Configurazione dell'app.
// SUPABASE_URL e SUPABASE_ANON_KEY si trovano in Supabase: Project Settings > API.
// La "anon key" è pubblica per design: è normale che stia qui. MAI mettere la "service_role" key.
window.CREW_CONFIG = {
  SUPABASE_URL: 'https://qkitqircjvavwuybozty.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_oXLRqqlztAVDYNHngpHAUQ__BL3Fj_a',
};

// I membri del gruppo. Per cambiare una foto basta cambiare il file in /img.
// "pos" sposta l'inquadratura nei cerchietti (orizzontale verticale, es. '50% 30%').
window.CREW_MEMBERS = [
  { id: 'fagio',  name: 'Fagio',  avatar: 'img/fagio.jpeg', pos: '50% 35%' },
  { id: 'buzzo',  name: 'Buzzo',  avatar: 'img/buzzo.jpeg', pos: '55% 30%' },
  { id: 'leo',    name: 'Leo',    avatar: 'img/leo.jpeg',   pos: '60% 50%' },
  { id: 'lori',   name: 'Lori',   avatar: 'img/lori.jpeg',  pos: '55% 25%' },
  { id: 'porce',  name: 'Porce',  avatar: 'img/porce.jpeg', pos: '55% 45%' },
];
