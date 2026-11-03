-- Archivio serate.
-- Da incollare in Supabase: SQL Editor -> New query -> Run.
-- Una serata aperta raccoglie in automatico: eventi Fanta Figa, azioni rapide, roulette.
-- Se nessuno la chiude, dopo 12 ore non conta più come aperta.

create table if not exists public.serate (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  closed_by text
);
create index if not exists serate_started_idx on public.serate (started_at desc);

-- La serata aperta adesso (se c'è).
create or replace function public.current_serata_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from serate
  where ended_at is null and started_at > now() - interval '12 hours'
  order by started_at desc limit 1;
$$;

create or replace function public.open_serata(p_name text, p_by text)
returns public.serate
language plpgsql
security definer
set search_path = public
as $$
declare s public.serate;
begin
  if current_serata_id() is not null then
    raise exception 'SERATA_GIA_APERTA';
  end if;
  -- chiude eventuali serate dimenticate aperte
  update serate set ended_at = started_at + interval '12 hours'
   where ended_at is null;
  insert into serate (name, created_by)
  values (coalesce(nullif(trim(p_name), ''), to_char(now() at time zone 'Europe/Rome', 'DD/MM') || ' - Serata'), p_by)
  returning * into s;
  return s;
end;
$$;

create or replace function public.close_serata(p_by text)
returns public.serate
language plpgsql
security definer
set search_path = public
as $$
declare s public.serate;
begin
  update serate set ended_at = now(), closed_by = p_by
   where id = current_serata_id()
  returning * into s;
  if s.id is null then raise exception 'NESSUNA_SERATA'; end if;
  return s;
end;
$$;

-- Collegamento automatico alla serata aperta.
alter table public.actions          add column if not exists serata_id uuid references public.serate(id) on delete set null;
alter table public.fanta_events     add column if not exists serata_id uuid references public.serate(id) on delete set null;
alter table public.roulette_results add column if not exists serata_id uuid references public.serate(id) on delete set null;

create index if not exists actions_serata_idx  on public.actions (serata_id);
create index if not exists fanta_serata_idx    on public.fanta_events (serata_id);
create index if not exists roulette_serata_idx on public.roulette_results (serata_id);

create or replace function public.set_serata_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.serata_id := current_serata_id();
  return new;
end;
$$;

drop trigger if exists set_serata_id on public.actions;
create trigger set_serata_id before insert on public.actions
  for each row execute function public.set_serata_id();
drop trigger if exists set_serata_id on public.fanta_events;
create trigger set_serata_id before insert on public.fanta_events
  for each row execute function public.set_serata_id();
drop trigger if exists set_serata_id on public.roulette_results;
create trigger set_serata_id before insert on public.roulette_results
  for each row execute function public.set_serata_id();

-- Sicurezza
alter table public.serate enable row level security;
drop policy if exists "serate_select" on public.serate;
create policy "serate_select" on public.serate for select to anon, authenticated using (true);
grant select on public.serate to anon, authenticated;
grant execute on function public.open_serata(text, text) to anon, authenticated;
grant execute on function public.close_serata(text) to anon, authenticated;

-- Tempo reale
do $$
begin
  alter publication supabase_realtime add table public.serate;
exception when duplicate_object then null;
end $$;
