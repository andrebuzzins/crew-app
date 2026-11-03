-- Fanta Figa, Roulette, Sfide.
-- Da incollare in Supabase: SQL Editor -> New query -> Run.

---------------------------------------------------------------
-- FANTA FIGA
---------------------------------------------------------------
create table if not exists public.fanta_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  ends_at timestamptz not null
);

create table if not exists public.fanta_votes (
  event_id uuid not null references public.fanta_events(id) on delete cascade,
  voter_id text not null,
  target_id text not null,
  score int not null check (score between 1 and 10),
  updated_at timestamptz not null default now(),
  primary key (event_id, voter_id, target_id),
  check (voter_id <> target_id)
);

-- Nuovo evento: l'ora di fine la decide il database (durata in secondi, 30..3600).
-- Non si può creare un evento se ce n'è già uno in corso.
create or replace function public.create_fanta_event(p_name text, p_by text, p_seconds int)
returns public.fanta_events
language plpgsql
security definer
set search_path = public
as $$
declare ev public.fanta_events;
begin
  if exists (select 1 from fanta_events where ends_at > now()) then
    raise exception 'EVENTO_IN_CORSO';
  end if;
  insert into fanta_events (name, created_by, ends_at)
  values (coalesce(nullif(trim(p_name), ''), 'Serata'), p_by,
          now() + make_interval(secs => least(greatest(p_seconds, 30), 3600)))
  returning * into ev;
  return ev;
end;
$$;

-- Voti bloccati anche lato database quando il tempo è scaduto.
create or replace function public.fanta_votes_check()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.fanta_events where id = new.event_id and ends_at > now()) then
    raise exception 'TEMPO_SCADUTO';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fanta_votes_check on public.fanta_votes;
create trigger fanta_votes_check
  before insert or update on public.fanta_votes
  for each row execute function public.fanta_votes_check();

alter table public.fanta_events enable row level security;
alter table public.fanta_votes enable row level security;

drop policy if exists "fanta_events_select" on public.fanta_events;
create policy "fanta_events_select" on public.fanta_events for select to anon, authenticated using (true);

drop policy if exists "fanta_votes_select" on public.fanta_votes;
create policy "fanta_votes_select" on public.fanta_votes for select to anon, authenticated using (true);
drop policy if exists "fanta_votes_insert" on public.fanta_votes;
create policy "fanta_votes_insert" on public.fanta_votes for insert to anon, authenticated with check (true);
drop policy if exists "fanta_votes_update" on public.fanta_votes;
create policy "fanta_votes_update" on public.fanta_votes for update to anon, authenticated using (true) with check (true);

grant select on public.fanta_events to anon, authenticated;
grant select, insert, update on public.fanta_votes to anon, authenticated;
grant execute on function public.create_fanta_event(text, text, int) to anon, authenticated;

---------------------------------------------------------------
-- ROULETTE: il risultato lo sceglie il database, uguale per tutti.
---------------------------------------------------------------
create table if not exists public.roulette_results (
  id uuid primary key default gen_random_uuid(),
  picked_member_id text not null,
  triggered_by text not null,
  created_at timestamptz not null default now()
);

create or replace function public.spin_roulette(p_by text, p_members text[])
returns public.roulette_results
language plpgsql
security definer
set search_path = public
as $$
declare r public.roulette_results;
begin
  -- evita due estrazioni sovrapposte
  if exists (select 1 from roulette_results where created_at > now() - interval '5 seconds') then
    raise exception 'GIA_IN_CORSO';
  end if;
  insert into roulette_results (picked_member_id, triggered_by)
  values (p_members[1 + floor(random() * array_length(p_members, 1))::int], p_by)
  returning * into r;
  return r;
end;
$$;

alter table public.roulette_results enable row level security;
drop policy if exists "roulette_select" on public.roulette_results;
create policy "roulette_select" on public.roulette_results for select to anon, authenticated using (true);
grant select on public.roulette_results to anon, authenticated;
grant execute on function public.spin_roulette(text, text[]) to anon, authenticated;

---------------------------------------------------------------
-- SFIDE + storico aggiornamenti
---------------------------------------------------------------
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  member_id text not null,
  title text not null,
  total_days int not null check (total_days between 1 and 3650),
  start_date date not null default current_date,
  progress_pct int not null default 0 check (progress_pct between 0 and 100),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_updates (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  author_id text not null,
  delta_pct int not null,
  created_at timestamptz not null default now()
);

create index if not exists challenge_updates_ch_idx on public.challenge_updates (challenge_id, created_at desc);

-- Aggiorna il progresso (0..100) e salva la riga di storico.
create or replace function public.update_challenge(p_id uuid, p_by text, p_delta int)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare c public.challenges;
begin
  update challenges
     set progress_pct = least(100, greatest(0, progress_pct + p_delta))
   where id = p_id
  returning * into c;
  if c.id is null then raise exception 'SFIDA_NON_TROVATA'; end if;
  insert into challenge_updates (challenge_id, author_id, delta_pct) values (p_id, p_by, p_delta);
  return c;
end;
$$;

alter table public.challenges enable row level security;
alter table public.challenge_updates enable row level security;

drop policy if exists "challenges_select" on public.challenges;
create policy "challenges_select" on public.challenges for select to anon, authenticated using (true);
drop policy if exists "challenges_insert" on public.challenges;
create policy "challenges_insert" on public.challenges for insert to anon, authenticated with check (true);
drop policy if exists "challenge_updates_select" on public.challenge_updates;
create policy "challenge_updates_select" on public.challenge_updates for select to anon, authenticated using (true);

grant select, insert on public.challenges to anon, authenticated;
grant select on public.challenge_updates to anon, authenticated;
grant execute on function public.update_challenge(uuid, text, int) to anon, authenticated;

---------------------------------------------------------------
-- Tempo reale per tutte le nuove tabelle
---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['fanta_events', 'fanta_votes', 'roulette_results', 'challenges', 'challenge_updates'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
