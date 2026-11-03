// Configurazione dell'app.
// SUPABASE_URL e SUPABASE_ANON_KEY si trovano in Supabase: Project Settings > API.
// La "anon key" è pubblica per design: è normale che stia qui. MAI mettere la "service_role" key.
window.CREW_CONFIG = {
  SUPABASE_URL: 'https://qkitqircjvavwuybozty.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_oXLRqqlztAVDYNHngpHAUQ__BL3Fj_a',
};

// I membri del gruppo. Per cambiare una foto basta cambiare il file in /img.
window.CREW_MEMBERS = [
  { id: 'fagio',  name: 'Fagio',  avatar: 'img/fagio.jpeg' },
  { id: 'buzzo',  name: 'Buzzo',  avatar: 'img/buzzo.jpeg' },
  { id: 'leo',    name: 'Leo',    avatar: 'img/leo.jpeg' },
  { id: 'lori',   name: 'Lori',   avatar: 'img/lori.jpeg' },
];
