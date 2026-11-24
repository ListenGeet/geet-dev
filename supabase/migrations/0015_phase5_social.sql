-- 0015 · Phase 5 social extensions (notifications, jam state transactions, blocking)

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('friend_request', 'request_accepted', 'suggestion', 'jam_invite')),
  reference_id text,
  track_id     uuid references public.tracks (id) on delete set null,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_profile_created_idx on public.notifications (profile_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (profile_id = (select public.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (profile_id = (select public.uid())) with check (profile_id = (select public.uid()));

revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Add notifications to supabase_realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;

-- Helper to check if two profiles have a block between them
create or replace function public.is_blocked(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'blocked'
      and ((f.requester_id = p_a and f.addressee_id = p_b) or (f.requester_id = p_b and f.addressee_id = p_a))
  );
$$;

-- Leave jam function: advances host if host leaves, or ends jam if last member leaves
create or replace function public.leave_jam(p_jam uuid, p_profile uuid)
returns public.jams
language plpgsql security definer set search_path = public
as $$
declare
  v_jam public.jams;
  v_new_host uuid;
  v_active_count int;
begin
  select * into v_jam from public.jams where id = p_jam for update;
  if v_jam.id is null then raise exception 'jam not found' using errcode = 'P0002'; end if;

  update public.jam_members set left_at = now()
  where jam_id = p_jam and profile_id = p_profile and left_at is null;

  select count(*) into v_active_count from public.jam_members
  where jam_id = p_jam and left_at is null;

  if v_active_count = 0 then
    update public.jams set ended_at = now(), is_playing = false, version = version + 1, updated_at = now()
    where id = p_jam
    returning * into v_jam;
  elsif v_jam.host_id = p_profile then
    select profile_id into v_new_host from public.jam_members
    where jam_id = p_jam and left_at is null
    order by joined_at asc limit 1;

    update public.jams set host_id = v_new_host, version = version + 1, updated_at = now()
    where id = p_jam
    returning * into v_jam;
  end if;

  return v_jam;
end;
$$;

-- End jam function (host only)
create or replace function public.end_jam(p_jam uuid, p_host uuid)
returns public.jams
language plpgsql security definer set search_path = public
as $$
declare
  v_jam public.jams;
begin
  select * into v_jam from public.jams where id = p_jam and host_id = p_host for update;
  if v_jam.id is null then raise exception 'jam not found or not host' using errcode = 'P0002'; end if;

  update public.jams set ended_at = now(), is_playing = false, version = version + 1, updated_at = now()
  where id = p_jam
  returning * into v_jam;

  return v_jam;
end;
$$;

-- Update jam state function with version guard
create or replace function public.update_jam_state(
  p_jam uuid,
  p_caller uuid,
  p_track uuid,
  p_position int,
  p_playing boolean,
  p_expected_version int
)
returns public.jams
language plpgsql security definer set search_path = public
as $$
declare
  v_jam public.jams;
begin
  select * into v_jam from public.jams where id = p_jam for update;
  if v_jam.id is null or v_jam.ended_at is not null then
    raise exception 'jam not found or ended' using errcode = 'P0002';
  end if;

  -- Verify control permissions: host or everyone mode with active membership
  if v_jam.host_id <> p_caller then
    if v_jam.controls <> 'everyone' or not exists (
      select 1 from public.jam_members where jam_id = p_jam and profile_id = p_caller and left_at is null
    ) then
      raise exception 'not authorized to control playback' using errcode = '42501';
    end if;
  end if;

  if v_jam.version <> p_expected_version then
    raise exception 'version conflict' using errcode = '40001';
  end if;

  update public.jams
  set track_id = coalesce(p_track, track_id),
      position_ms = greatest(0, p_position),
      is_playing = p_playing,
      version = version + 1,
      updated_at = now()
  where id = p_jam and version = p_expected_version
  returning * into v_jam;

  return v_jam;
end;
$$;

-- Advance jam queue: pops next song from queue and advances jam
create or replace function public.advance_jam_queue(
  p_jam uuid,
  p_caller uuid,
  p_expected_version int
)
returns public.jams
language plpgsql security definer set search_path = public
as $$
declare
  v_jam public.jams;
  v_next_track uuid;
  v_queue_id uuid;
begin
  select * into v_jam from public.jams where id = p_jam for update;
  if v_jam.id is null or v_jam.ended_at is not null then
    raise exception 'jam not found or ended' using errcode = 'P0002';
  end if;

  if v_jam.host_id <> p_caller then
    if v_jam.controls <> 'everyone' or not exists (
      select 1 from public.jam_members where jam_id = p_jam and profile_id = p_caller and left_at is null
    ) then
      raise exception 'not authorized to control playback' using errcode = '42501';
    end if;
  end if;

  if v_jam.version <> p_expected_version then
    raise exception 'version conflict' using errcode = '40001';
  end if;

  select id, track_id into v_queue_id, v_next_track from public.jam_queue
  where jam_id = p_jam
  order by position asc
  limit 1
  for update;

  if v_queue_id is not null then
    delete from public.jam_queue where id = v_queue_id;
    update public.jams
    set track_id = v_next_track,
        position_ms = 0,
        is_playing = true,
        version = version + 1,
        updated_at = now()
    where id = p_jam and version = p_expected_version
    returning * into v_jam;
  else
    update public.jams
    set is_playing = false,
        version = version + 1,
        updated_at = now()
    where id = p_jam and version = p_expected_version
    returning * into v_jam;
  end if;

  return v_jam;
end;
$$;

-- Grants
do $$
declare
  f text;
begin
  foreach f in array array[
    'is_blocked(uuid,uuid)', 'leave_jam(uuid,uuid)', 'end_jam(uuid,uuid)',
    'update_jam_state(uuid,uuid,uuid,int,boolean,int)', 'advance_jam_queue(uuid,uuid,int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;
grant execute on function public.leave_jam(uuid, uuid) to authenticated;
grant execute on function public.end_jam(uuid, uuid) to authenticated;
grant execute on function public.update_jam_state(uuid, uuid, uuid, int, boolean, int) to authenticated;
grant execute on function public.advance_jam_queue(uuid, uuid, int) to authenticated;
