# Crew App

App privata per Faggio, Buzzo, Leo e Lori. L'app vera sta tutta in `public/`.

## Collegare Supabase (una volta sola)
1. Vai su https://supabase.com/dashboard e apri il tuo progetto (o creane uno nuovo, piano Free).
2. Vai in **Project Settings → API** (o "Data API" / "API Keys").
3. Copia:
   - **Project URL** (tipo `https://abcdefgh.supabase.co`)
   - **anon public key** (una stringa lunga che inizia con `eyJ...`, oppure la "publishable key" `sb_publishable_...`)
4. Incollale in `public/js/config.js` in `SUPABASE_URL` e `SUPABASE_ANON_KEY`.

La anon key è pubblica per design. **Non** usare mai la `service_role` / secret key.

## Provarla in locale
Dalla cartella del progetto:
```
npx serve public
```
poi apri l'indirizzo che stampa. Per provare il "multiplayer" apri due finestre e scegli due profili diversi.

## Profili
Sono in `public/js/config.js` (`CREW_MEMBERS`). Le foto sono in `public/img/`.
Il profilo scelto resta salvato sul telefono; si cambia toccando la propria foto in alto a destra.
