-- IL LIBRO NERO: storia a catena ("cadavere squisito").
-- Ognuno vede solo l'ultima riga, aggiunge la sua, e alla fine il capitolo si rivela.
-- Da incollare in Supabase: SQL Editor -> New query -> Run.

create table if not exists public.libro_storie (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 80),
  created_by text not null,
  max_lines int not null default 10 check (max_lines between 4 and 30),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.libro_righe (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.libro_storie(id) on delete cascade,
  author_id text not null,
  text text not null check (char_length(trim(text)) between 1 and 240),
  created_at timestamptz not null default now()
);
create index if not exists libro_righe_story_idx on public.libro_righe (story_id, created_at);

-- Nuovo capitolo con la prima riga. Un solo capitolo aperto alla volta.
create or replace function public.libro_nuovo(p_title text, p_by text, p_max int, p_first text)
returns public.libro_storie
language plpgsql
security definer
set search_path = public
as $$
declare s public.libro_storie;
begin
  if exists (select 1 from libro_storie where closed_at is null) then
    raise exception 'CAPITOLO_APERTO';
  end if;
  insert into libro_storie (title, created_by, max_lines)
  values (trim(p_title), p_by, least(greatest(coalesce(p_max, 10), 4), 30))
  returning * into s;
  insert into libro_righe (story_id, author_id, text) values (s.id, p_by, trim(p_first));
  return s;
end;
$$;

-- Controlli su ogni riga: capitolo aperto, niente due righe di fila della stessa persona.
create or replace function public.libro_righe_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare s public.libro_storie; last_author text;
begin
  select * into s from libro_storie where id = new.story_id for update;
  if s.id is null or s.closed_at is not null then
    raise exception 'CAPITOLO_CHIUSO';
  end if;
  select author_id into last_author from libro_righe
   where story_id = new.story_id order by created_at desc limit 1;
  if last_author = new.author_id then
    raise exception 'NON_DUE_DI_FILA';
  end if;
  new.text := trim(new.text);
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists libro_righe_check on public.libro_righe;
create trigger libro_righe_check before insert on public.libro_righe
  for each row execute function public.libro_righe_check();

-- Raggiunto il numero di righe, il capitolo si chiude e si rivela.
create or replace function public.libro_righe_autoclose()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update libro_storie s set closed_at = now()
   where s.id = new.story_id and s.closed_at is null
     and (select count(*) from libro_righe r where r.story_id = s.id) >= s.max_lines;
  return null;
end;
$$;

drop trigger if exists libro_righe_autoclose on public.libro_righe;
create trigger libro_righe_autoclose after insert on public.libro_righe
  for each row execute function public.libro_righe_autoclose();

-- Chiudi e rivela in anticipo (servono almeno 3 righe).
create or replace function public.libro_chiudi(p_id uuid)
returns public.libro_storie
language plpgsql
security definer
set search_path = public
as $$
declare s public.libro_storie;
begin
  if (select count(*) from libro_righe where story_id = p_id) < 3 then
    raise exception 'TROPPO_CORTO';
  end if;
  update libro_storie set closed_at = now() where id = p_id and closed_at is null
  returning * into s;
  return s;
end;
$$;

alter table public.libro_storie enable row level security;
alter table public.libro_righe enable row level security;

drop policy if exists "libro_storie_select" on public.libro_storie;
create policy "libro_storie_select" on public.libro_storie for select to anon, authenticated using (true);
drop policy if exists "libro_storie_delete" on public.libro_storie;
create policy "libro_storie_delete" on public.libro_storie for delete to anon, authenticated using (true);

drop policy if exists "libro_righe_select" on public.libro_righe;
create policy "libro_righe_select" on public.libro_righe for select to anon, authenticated using (true);
drop policy if exists "libro_righe_insert" on public.libro_righe;
create policy "libro_righe_insert" on public.libro_righe for insert to anon, authenticated with check (true);

grant select, delete on public.libro_storie to anon, authenticated;
grant select, insert on public.libro_righe to anon, authenticated;
grant execute on function public.libro_nuovo(text, text, int, text) to anon, authenticated;
grant execute on function public.libro_chiudi(uuid) to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['libro_storie', 'libro_righe'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
