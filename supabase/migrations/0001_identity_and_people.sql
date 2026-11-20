-- 0001 · extensions, identity mapping, people (docs/13)
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- Clerk user ids are strings, profiles use UUIDs. `provider` leaves room for firebase later.
create table if not exists public.identities (
  provider   text not null,
  subject    text not null,
  profile_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (provider, subject)
);

create table if not exists public.profiles (
  id                 uuid primary key default gen_random_uuid(),
  username           text unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name       text check (char_length(display_name) <= 60),
  avatar_url         text,
  role               text not null default 'user' check (role in ('user', 'uploader', 'admin')),
  language           text not null default 'en' check (language in ('en', 'pa', 'hi')),
  music_languages    text[] not null default '{}',
  favourite_artists  text[] not null default '{}',
  show_listening     text not null default 'friends' check (show_listening in ('friends', 'nobody')),
  accept_requests    text not null default 'everyone' check (accept_requests in ('everyone', 'nobody')),
  onboarded_at       timestamptz,
  username_changed_at timestamptz,
  email_news         boolean not null default false,
  email_news_at      timestamptz,
  welcome_sent_at    timestamptz,
  created_at         timestamptz not null default now(),
  constraint profiles_music_languages_len check (cardinality(music_languages) <= 12),
  constraint profiles_favourite_artists_len check (cardinality(favourite_artists) <= 50)
);

alter table public.identities
  drop constraint if exists identities_profile_id_fkey,
  add constraint identities_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade;
create index if not exists identities_profile_idx on public.identities (profile_id);

-- Maps the Clerk `sub` in the request token to a profile. Security definer so it can read identities.
create or replace function public.uid() returns uuid
language sql stable security definer set search_path = public
as $$
  select profile_id from public.identities
  where provider = 'clerk' and subject = (auth.jwt() ->> 'sub')
$$;
revoke all on function public.uid() from public;
grant execute on function public.uid() to anon, authenticated, service_role;

-- Safe columns only. Email is never stored in profiles.
create or replace view public.public_profiles as
  select id, username, display_name, avatar_url from public.profiles;
revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated, service_role;

create table if not exists public.devices (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  name               text not null,
  kind               text not null check (kind in ('web', 'android', 'ios')),
  last_seen_at       timestamptz not null default now(),
  listening_track_id uuid,
  listening_since    timestamptz
);
create index if not exists devices_profile_idx on public.devices (profile_id);

create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  device_id   uuid references public.devices (id) on delete cascade,
  kind        text not null check (kind in ('webpush', 'fcm')),
  endpoint    text not null,
  keys        jsonb,
  prefs       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (kind, endpoint)
);
create index if not exists push_tokens_profile_idx on public.push_tokens (profile_id);

-- No IP address is stored. Rows are deleted 90 days after last_seen (cleanup cron, later phase).
create table if not exists public.sign_in_devices (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  fingerprint      text not null,
  label            text,
  city             text,
  country          text,
  first_seen       timestamptz not null default now(),
  last_seen        timestamptz not null default now(),
  clerk_session_id text,
  unique (profile_id, fingerprint)
);
create index if not exists sign_in_devices_last_seen_idx on public.sign_in_devices (last_seen);
