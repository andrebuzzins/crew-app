-- Azioni Rapide (Barleo / Sto scopando.)
-- Da incollare in Supabase: SQL Editor -> New query -> Run.

create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('barleo', 'scopando')),
  member_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists actions_created_at_idx on public.actions (created_at desc);

-- Sicurezza: tutti leggono e aggiungono, nessuno modifica o cancella dall'app.
alter table public.actions enable row level security;

drop policy if exists "actions_select" on public.actions;
create policy "actions_select" on public.actions
  for select to anon, authenticated using (true);

drop policy if exists "actions_insert" on public.actions;
create policy "actions_insert" on public.actions
  for insert to anon, authenticated with check (true);

grant select, insert on public.actions to anon, authenticated;

-- Cooldown: la stessa persona non può premere la stessa azione
-- più di una volta ogni 5 minuti. L'ora la decide il database.
create or replace function public.actions_cooldown()
returns trigger
language plpgsql
as $$
begin
  new.created_at := now();
  if exists (
    select 1 from public.actions
    where member_id = new.member_id
      and type = new.type
      and created_at > now() - interval '5 minutes'
  ) then
    raise exception 'COOLDOWN';
  end if;
  return new;
end;
$$;

drop trigger if exists actions_cooldown on public.actions;
create trigger actions_cooldown
  before insert on public.actions
  for each row execute function public.actions_cooldown();

-- Tempo reale: avvisa tutti i telefoni quando arriva una nuova azione.
do $$
begin
  alter publication supabase_realtime add table public.actions;
exception when duplicate_object then null;
end $$;
