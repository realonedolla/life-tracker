-- Life Tracker: Freunde-Abgleich. Einmal im Supabase SQL Editor ausführen.
-- Geteilt wird nur eine Tageszusammenfassung (Prozent, Gold, Streak, Routinen,
-- Arbeitsstunden, Wasser). Keine Fotos, Notizen oder Zielnamen.
-- Jedes Gerät meldet sich anonym an (kein Passwort, keine E-Mail).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists public.day_stats (
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  score real not null check (score between 0 and 1),
  gold boolean not null default false,
  routines_done int not null default 0,
  routines_total int not null default 0,
  work_hours real not null default 0,
  water_ml int not null default 0,
  water_goal_ml int not null default 0,
  streak int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.day_stats enable row level security;

-- Ist other mit dem angemeldeten Gerät befreundet?
create or replace function public.is_friend(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where user_id = auth.uid() and friend_id = other);
$$;

drop policy if exists "profiles: eigenes oder Freunde lesen" on public.profiles;
create policy "profiles: eigenes oder Freunde lesen" on public.profiles
  for select using (id = auth.uid() or public.is_friend(id));

drop policy if exists "friendships: eigene lesen" on public.friendships;
create policy "friendships: eigene lesen" on public.friendships
  for select using (user_id = auth.uid());

drop policy if exists "day_stats: eigene oder Freunde lesen" on public.day_stats;
create policy "day_stats: eigene oder Freunde lesen" on public.day_stats
  for select using (user_id = auth.uid() or public.is_friend(user_id));

drop policy if exists "day_stats: eigene schreiben" on public.day_stats;
create policy "day_stats: eigene schreiben" on public.day_stats
  for insert with check (user_id = auth.uid());

drop policy if exists "day_stats: eigene ändern" on public.day_stats;
create policy "day_stats: eigene ändern" on public.day_stats
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Profil anlegen (oder Namen ändern); vergibt einen 6-stelligen Freundes-Code.
create or replace function public.create_profile(p_name text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  r profiles;
  c text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  update profiles set name = trim(p_name) where id = auth.uid() returning * into r;
  if found then return r; end if;
  loop
    -- Code aus Hex-Zeichen ohne 0 und 1 (gut lesbar), z. B. „7C4E9B“.
    c := upper(substr(translate(md5(random()::text || clock_timestamp()::text), '01', ''), 1, 6));
    exit when length(c) = 6 and not exists (select 1 from profiles where code = c);
  end loop;
  insert into profiles (id, name, code) values (auth.uid(), trim(p_name), c) returning * into r;
  return r;
end $$;

-- Freund per Code hinzufügen; die Freundschaft gilt in beide Richtungen.
create or replace function public.add_friend(p_code text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  f profiles;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into f from profiles where code = upper(trim(p_code));
  if not found then raise exception 'Code nicht gefunden'; end if;
  if f.id = auth.uid() then raise exception 'Das ist dein eigener Code'; end if;
  insert into friendships (user_id, friend_id) values (auth.uid(), f.id) on conflict do nothing;
  insert into friendships (user_id, friend_id) values (f.id, auth.uid()) on conflict do nothing;
  return f;
end $$;

-- Freundschaft auf beiden Seiten beenden.
create or replace function public.remove_friend(p_friend uuid) returns void
language sql security definer set search_path = public as $$
  delete from friendships
  where (user_id = auth.uid() and friend_id = p_friend) or (user_id = p_friend and friend_id = auth.uid());
$$;

-- Nicht mehr teilen: Profil, Freundschaften und alle Tageswerte löschen.
create or replace function public.delete_me() returns void
language sql security definer set search_path = public as $$
  delete from profiles where id = auth.uid();
$$;

revoke all on function public.create_profile(text), public.add_friend(text), public.remove_friend(uuid), public.delete_me() from public, anon;
grant execute on function public.create_profile(text), public.add_friend(text), public.remove_friend(uuid), public.delete_me(), public.is_friend(uuid) to authenticated;
