-- 0002 · email tables (docs/13, docs/20). Server only: no policies.
create table if not exists public.email_campaigns (
  id            uuid primary key default gen_random_uuid(),
  template      text not null,
  language      text not null default 'en' check (language in ('en', 'pa', 'hi')),
  subject       text not null,
  preheader     text,
  content       jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  status        text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.email_jobs (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('code', 'welcome', 'alert', 'marketing', 'copyright', 'digest')),
  priority        int not null default 5,
  profile_id      uuid references public.profiles (id) on delete cascade,
  template        text not null,
  data            jsonb not null default '{}'::jsonb,
  state           text not null default 'queued' check (state in ('queued', 'sent', 'failed', 'cancelled')),
  send_after      timestamptz not null default now(),
  campaign_id     uuid references public.email_campaigns (id) on delete set null,
  attempts        int not null default 0,
  idempotency_key text not null unique,
  created_at      timestamptz not null default now()
);
create index if not exists email_jobs_queue_idx on public.email_jobs (state, send_after, priority);

-- No address and no body, ever. Deleted after 90 days.
create table if not exists public.email_log (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid references public.email_jobs (id) on delete set null,
  template   text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  resend_id  text,
  status     text not null,
  created_at timestamptz not null default now()
);
create index if not exists email_log_created_idx on public.email_log (created_at);

create table if not exists public.email_suppressions (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  reason     text not null check (reason in ('bounce', 'complaint', 'unsubscribe')),
  created_at timestamptz not null default now()
);
