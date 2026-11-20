-- 0004 · library (docs/13)
create table if not exists public.favorites (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  track_id   uuid not null references public.tracks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, track_id)
);

create table if not exists public.playlists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  kind       text not null default 'user' check (kind in ('user', 'daily_mix')),
  mix_index  int check (mix_index between 1 and 3),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists playlists_owner_idx on public.playlists (owner_id);

create table if not exists public.playlist_tracks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_id    uuid not null references public.tracks (id) on delete cascade,
  position    int not null,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, track_id)
);
create index if not exists playlist_tracks_order_idx on public.playlist_tracks (playlist_id, position);

create table if not exists public.play_history (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  track_id    uuid not null references public.tracks (id) on delete cascade,
  played_at   timestamptz not null default now(),
  listened_ms int not null default 0 check (listened_ms >= 0),
  outcome     text not null check (outcome in ('completed', 'skipped', 'partial'))
);
create index if not exists play_history_profile_idx on public.play_history (profile_id, played_at desc);
create index if not exists play_history_track_idx on public.play_history (track_id, played_at desc);

create table if not exists public.search_history (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  query      text not null check (char_length(query) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists search_history_profile_idx on public.search_history (profile_id, created_at desc);

-- Keep the newest 20 per user, on insert.
create or replace function public.search_history_trim() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.search_history
  where profile_id = new.profile_id
    and id in (
      select id from public.search_history where profile_id = new.profile_id
      order by created_at desc, id offset 20
    );
  return null;
end
$$;
drop trigger if exists search_history_trim_trg on public.search_history;
create trigger search_history_trim_trg after insert on public.search_history
  for each row execute function public.search_history_trim();
