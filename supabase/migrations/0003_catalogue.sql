-- 0003 · catalogue (docs/13)
create table if not exists public.tracks (
  id          uuid primary key default gen_random_uuid(),
  uploader_id uuid references public.profiles (id) on delete set null,
  title       text not null,
  artist      text not null,
  artist_key  text not null default '',
  album       text,
  language    text,
  genre       text,
  search_text text not null default '',
  translit    text,
  duration_ms int check (duration_ms is null or duration_ms >= 0),
  waveform    smallint[] check (waveform is null or cardinality(waveform) = 64),
  status      text not null default 'uploading'
              check (status in ('uploading', 'queued', 'processing', 'ready', 'failed', 'hidden', 'removed')),
  plays       int not null default 0,
  error       text,
  created_at  timestamptz not null default now(),
  removed_at  timestamptz,
  removed_by  uuid references public.profiles (id) on delete set null
);

-- artist_key: lower, trimmed, NFKC. search_text: title + artist + album + transliteration.
create or replace function public.tracks_derive() returns trigger
language plpgsql set search_path = public
as $$
begin
  new.artist_key := lower(btrim(normalize(new.artist, NFKC)));
  new.search_text := lower(normalize(concat_ws(' ', new.title, new.artist, new.album, new.translit), NFKC));
  return new;
end
$$;
drop trigger if exists tracks_derive_trg on public.tracks;
create trigger tracks_derive_trg before insert or update of title, artist, album, translit
  on public.tracks for each row execute function public.tracks_derive();

create index if not exists tracks_search_trgm on public.tracks using gin (search_text extensions.gin_trgm_ops);
create index if not exists tracks_status_created on public.tracks (status, created_at desc);
create index if not exists tracks_artist_key on public.tracks (artist_key);
create index if not exists tracks_language on public.tracks (language);

create table if not exists public.track_files (
  track_id     uuid not null references public.tracks (id) on delete cascade,
  kind         text not null check (kind in ('full', 'preview', 'cover')),
  path         text not null,
  size_bytes   bigint,
  codec        text,
  bitrate_kbps int,
  content_type text,
  primary key (track_id, kind)
);

create table if not exists public.track_lyrics (
  track_id uuid primary key references public.tracks (id) on delete cascade,
  plain    text,
  synced   jsonb
);

create table if not exists public.promos (
  id           uuid primary key default gen_random_uuid(),
  kicker       text,
  title        text not null,
  button_label text,
  image_path   text,
  link         text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  active       boolean not null default false,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  track_id       uuid references public.tracks (id) on delete set null,
  reporter_id    uuid references public.profiles (id) on delete set null,
  reporter_email text,
  kind           text not null check (kind in ('song', 'copyright')),
  reason         text not null,
  note           text check (char_length(note) <= 500),
  claimant       jsonb,
  status         text not null default 'open' check (status in ('open', 'dismissed', 'removed')),
  handled_by     uuid references public.profiles (id) on delete set null,
  handled_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

create table if not exists public.upload_jobs (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references public.tracks (id) on delete cascade,
  state       text not null default 'awaiting_upload'
              check (state in ('awaiting_upload', 'queued', 'running', 'done', 'failed')),
  attempts    int not null default 0,
  lease_until timestamptz,
  claimed_by  text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists upload_jobs_claim_idx on public.upload_jobs (state, created_at);

create table if not exists public.admin_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
