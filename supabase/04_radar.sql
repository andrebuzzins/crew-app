-- Radar IG: persone (nome scelto a mano) + commenti. Solo testo scritto dal gruppo.
-- Da incollare in Supabase: SQL Editor -> New query -> Run.

create table if not exists public.radar_targets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.radar_notes (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.radar_targets(id) on delete cascade,
  author_id text not null,
  text text not null check (char_length(trim(text)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists radar_notes_target_idx on public.radar_notes (target_id, created_at);

alter table public.radar_targets enable row level security;
alter table public.radar_notes enable row level security;

-- Tutti leggono, aggiungono ed eliminano (eliminando una persona spariscono anche i suoi commenti).
drop policy if exists "radar_targets_select" on public.radar_targets;
create policy "radar_targets_select" on public.radar_targets for select to anon, authenticated using (true);
drop policy if exists "radar_targets_insert" on public.radar_targets;
create policy "radar_targets_insert" on public.radar_targets for insert to anon, authenticated with check (true);
drop policy if exists "radar_targets_delete" on public.radar_targets;
create policy "radar_targets_delete" on public.radar_targets for delete to anon, authenticated using (true);

drop policy if exists "radar_notes_select" on public.radar_notes;
create policy "radar_notes_select" on public.radar_notes for select to anon, authenticated using (true);
drop policy if exists "radar_notes_insert" on public.radar_notes;
create policy "radar_notes_insert" on public.radar_notes for insert to anon, authenticated with check (true);
drop policy if exists "radar_notes_delete" on public.radar_notes;
create policy "radar_notes_delete" on public.radar_notes for delete to anon, authenticated using (true);

grant select, insert, delete on public.radar_targets to anon, authenticated;
grant select, insert, delete on public.radar_notes to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['radar_targets', 'radar_notes'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
