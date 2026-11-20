-- 0005 · social (docs/13)
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
-- One row per pair, whichever way round.
create unique index if not exists friendships_pair_uniq on public.friendships (
  (case when requester_id < addressee_id then requester_id else addressee_id end),
  (case when requester_id < addressee_id then addressee_id else requester_id end)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

create table if not exists public.suggestions (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null references public.profiles (id) on delete cascade,
  to_id      uuid not null references public.profiles (id) on delete cascade,
  track_id   uuid not null references public.tracks (id) on delete cascade,
  note       text check (char_length(note) <= 200),
  seen_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists suggestions_to_idx on public.suggestions (to_id, created_at desc);

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.profiles (id) on delete cascade,
  user_b          uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index if not exists conversations_b_idx on public.conversations (user_b);

create table if not exists public.jams (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  host_id     uuid not null references public.profiles (id) on delete cascade,
  controls    text not null default 'host' check (controls in ('host', 'everyone')),
  track_id    uuid references public.tracks (id) on delete set null,
  position_ms int not null default 0,
  is_playing  boolean not null default false,
  version     int not null default 0,
  updated_at  timestamptz not null default now(),
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.jam_members (
  jam_id     uuid not null references public.jams (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (jam_id, profile_id)
);
create index if not exists jam_members_profile_idx on public.jam_members (profile_id);

create table if not exists public.jam_queue (
  id         uuid primary key default gen_random_uuid(),
  jam_id     uuid not null references public.jams (id) on delete cascade,
  track_id   uuid not null references public.tracks (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  position   int not null,
  created_at timestamptz not null default now()
);
create index if not exists jam_queue_order_idx on public.jam_queue (jam_id, position);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  kind            text not null default 'text' check (kind in ('text', 'track', 'jam')),
  body            text check (char_length(body) <= 2000),
  track_id        uuid references public.tracks (id) on delete set null,
  jam_id          uuid references public.jams (id) on delete set null,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at desc);

create table if not exists public.conversation_reads (
  conversation_id      uuid not null references public.conversations (id) on delete cascade,
  profile_id           uuid not null references public.profiles (id) on delete cascade,
  last_read_at         timestamptz not null default now(),
  last_read_message_id uuid references public.messages (id) on delete set null,
  primary key (conversation_id, profile_id)
);

-- Operational
create table if not exists public.usage_daily (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  plays      int not null default 0,
  uploads    int not null default 0,
  ai_count   int not null default 0,
  primary key (profile_id, day)
);

create table if not exists public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

create table if not exists public.egress_daily (
  day      date not null,
  provider text not null,
  bytes    bigint not null default 0,
  primary key (day, provider)
);
