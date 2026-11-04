-- Nuovo Fanta Figa (conteggio per periodo), "Oggi vi segnalo", eliminazione sfide.
-- Da incollare in Supabase: SQL Editor -> New query -> Run.

---------------------------------------------------------------
-- FANTA FIGA: periodi + eventi registrati con feedback
---------------------------------------------------------------
create table if not exists public.ff_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Fanta Figa',
  starts_on date not null,
  ends_on date not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table if not exists public.ff_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.ff_periods(id) on delete cascade,
  member_id text not null,
  kind text not null check (kind in ('scopata', 'pompino', 'sega', 'limone')),
  feedback text check (feedback is null or char_length(feedback) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists ff_entries_period_idx on public.ff_entries (period_id, created_at desc);

-- Oggi in Italia
create or replace function public.today_rome()
returns date language sql stable as $$ select (now() at time zone 'Europe/Rome')::date $$;

-- Nuovo periodo: non si sovrappone a uno in corso.
create or replace function public.create_ff_period(p_name text, p_from date, p_to date, p_by text)
returns public.ff_periods
language plpgsql
security definer
set search_path = public
as $$
declare p public.ff_periods;
begin
  if exists (select 1 from ff_periods where ends_on >= today_rome() and starts_on <= today_rome()) then
    raise exception 'PERIODO_IN_CORSO';
  end if;
  if p_to < p_from then raise exception 'DATE_SBAGLIATE'; end if;
  insert into ff_periods (name, starts_on, ends_on, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'Fanta Figa'), p_from, p_to, p_by)
  returning * into p;
  return p;
end;
$$;

-- Si registra solo dentro il periodo.
create or replace function public.ff_entries_check()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.ff_periods
                 where id = new.period_id and today_rome() between starts_on and ends_on) then
    raise exception 'PERIODO_CHIUSO';
  end if;
  new.created_at := now();
  new.feedback := nullif(trim(new.feedback), '');
  return new;
end;
$$;

drop trigger if exists ff_entries_check on public.ff_entries;
create trigger ff_entries_check before insert on public.ff_entries
  for each row execute function public.ff_entries_check();

alter table public.ff_periods enable row level security;
alter table public.ff_entries enable row level security;

drop policy if exists "ff_periods_select" on public.ff_periods;
create policy "ff_periods_select" on public.ff_periods for select to anon, authenticated using (true);
drop policy if exists "ff_entries_select" on public.ff_entries;
create policy "ff_entries_select" on public.ff_entries for select to anon, authenticated using (true);
drop policy if exists "ff_entries_insert" on public.ff_entries;
create policy "ff_entries_insert" on public.ff_entries for insert to anon, authenticated with check (true);
drop policy if exists "ff_entries_delete" on public.ff_entries;
create policy "ff_entries_delete" on public.ff_entries for delete to anon, authenticated using (true);

grant select on public.ff_periods to anon, authenticated;
grant select, insert, delete on public.ff_entries to anon, authenticated;
grant execute on function public.create_ff_period(text, date, date, text) to anon, authenticated;

---------------------------------------------------------------
-- OGGI VI SEGNALO: restano 7 giorni, oppure per sempre se keep_forever
---------------------------------------------------------------
create table if not exists public.segnalazioni (
  id uuid primary key default gen_random_uuid(),
  author_id text not null,
  text text not null check (char_length(trim(text)) between 1 and 500),
  keep_forever boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists segnalazioni_created_idx on public.segnalazioni (created_at desc);

alter table public.segnalazioni enable row level security;
drop policy if exists "segn_select" on public.segnalazioni;
create policy "segn_select" on public.segnalazioni for select to anon, authenticated using (true);
drop policy if exists "segn_insert" on public.segnalazioni;
create policy "segn_insert" on public.segnalazioni for insert to anon, authenticated with check (true);
drop policy if exists "segn_update" on public.segnalazioni;
create policy "segn_update" on public.segnalazioni for update to anon, authenticated using (true) with check (true);
drop policy if exists "segn_delete" on public.segnalazioni;
create policy "segn_delete" on public.segnalazioni for delete to anon, authenticated using (true);

-- dall'app si può cambiare solo "per sempre sì/no"
grant select, insert, delete on public.segnalazioni to anon, authenticated;
grant update (keep_forever) on public.segnalazioni to anon, authenticated;

-- Pulizia: cancella quelle più vecchie di 7 giorni non tenute per sempre.
create or replace function public.cleanup_segnalazioni()
returns int
language sql
security definer
set search_path = public
as $$
  with d as (
    delete from segnalazioni
    where not keep_forever and created_at < now() - interval '7 days'
    returning 1
  ) select count(*)::int from d;
$$;
grant execute on function public.cleanup_segnalazioni() to anon, authenticated;

---------------------------------------------------------------
-- SFIDE: ora si possono eliminare
---------------------------------------------------------------
drop policy if exists "challenges_delete" on public.challenges;
create policy "challenges_delete" on public.challenges for delete to anon, authenticated using (true);
grant delete on public.challenges to anon, authenticated;

---------------------------------------------------------------
-- Tempo reale
---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ff_periods', 'ff_entries', 'segnalazioni'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
