-- Phase 6: atomically consume an assistant message from the caller's UTC daily allowance.
create or replace function public.consume_ai_message(p_profile uuid, p_limit int)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.usage_daily (profile_id, day, ai_count)
  values (p_profile, current_date, 1)
  on conflict (profile_id, day) do update
    set ai_count = public.usage_daily.ai_count + 1
    where public.usage_daily.ai_count < greatest(p_limit, 1)
  returning ai_count into v_count;
  return found;
end
$$;

revoke all on function public.consume_ai_message(uuid, int) from public, anon, authenticated;
grant execute on function public.consume_ai_message(uuid, int) to service_role;

-- Marketing queue: claim jobs under one advisory lock so overlapping cron requests share the same budget.
alter table public.email_jobs add column if not exists started_at timestamptz;
alter table public.email_jobs drop constraint if exists email_jobs_state_check;
alter table public.email_jobs add constraint email_jobs_state_check
  check (state in ('queued', 'sending', 'sent', 'failed', 'cancelled'));

create or replace function public.claim_marketing_jobs(p_limit int)
returns table (id uuid, profile_id uuid, campaign_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_total_sent int;
  v_marketing_sent int;
  v_total_sending int;
  v_marketing_sending int;
  v_capacity int;
begin
  perform pg_advisory_xact_lock(hashtext('geet:marketing-budget:' || current_date::text));

  select count(*) into v_total_sent from public.email_log
    where status = 'sent' and created_at >= date_trunc('day', now());
  select count(*) into v_marketing_sent from public.email_log l
    join public.email_jobs j on j.id = l.job_id
    where l.status = 'sent' and j.kind = 'marketing' and l.created_at >= date_trunc('day', now());
  select count(*) into v_total_sending from public.email_jobs
    where state = 'sending' and started_at >= date_trunc('day', now());
  select count(*) into v_marketing_sending from public.email_jobs
    where kind = 'marketing' and state = 'sending' and started_at >= date_trunc('day', now());

  v_capacity := least(
    greatest(p_limit - v_marketing_sent - v_marketing_sending, 0),
    greatest(80 - v_total_sent - v_total_sending, 0)
  );
  if v_capacity < 1 then return; end if;

  return query
  with candidates as (
    select j.id from public.email_jobs j
      join public.email_campaigns c on c.id = j.campaign_id
      where j.kind = 'marketing'
        and j.profile_id is not null
        and j.send_after <= now()
        and j.attempts < 3
        and j.state in ('queued', 'failed')
        and c.status in ('scheduled', 'sending')
      order by j.send_after, j.created_at
      for update of j skip locked
      limit v_capacity
  ), claimed as (
    update public.email_jobs j
      set state = 'sending', started_at = now()
      from candidates c where j.id = c.id
      returning j.id, j.profile_id, j.campaign_id
  )
  select claimed.id, claimed.profile_id, claimed.campaign_id from claimed;
end
$$;

revoke all on function public.claim_marketing_jobs(int) from public, anon, authenticated;
grant execute on function public.claim_marketing_jobs(int) to service_role;

create or replace function public.queue_marketing_campaign(p_campaign uuid, p_language text)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.email_jobs (kind, priority, profile_id, template, data, send_after, campaign_id, idempotency_key)
  select 'marketing', 10, p.id, c.template, c.content,
         coalesce(c.scheduled_for, now()), c.id, c.id::text || ':' || p.id::text
  from public.email_campaigns c
  join public.profiles p on p.email_news = true and (p_language is null or p.language = p_language)
  where c.id = p_campaign
    and not exists (select 1 from public.email_suppressions s where s.profile_id = p.id)
  on conflict (idempotency_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function public.queue_marketing_campaign(uuid, text) from public, anon, authenticated;
grant execute on function public.queue_marketing_campaign(uuid, text) to service_role;
