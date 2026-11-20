-- 0006 · functions (docs/13). Sensitive ones are security definer with explicit grants.

create or replace function public.is_jam_member(p_jam uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.jam_members m
    where m.jam_id = p_jam and m.profile_id = public.uid() and m.left_at is null
  )
$$;

create or replace function public.are_friends(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = p_a and f.addressee_id = p_b) or (f.requester_id = p_b and f.addressee_id = p_a))
  )
$$;

-- Creates the profile and identity together, once, even when two requests race.
create or replace function public.ensure_profile(
  p_provider text, p_subject text, p_display_name text, p_avatar_url text, p_role text
) returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_row public.profiles;
begin
  perform pg_advisory_xact_lock(hashtext(p_provider || ':' || p_subject));
  select profile_id into v_id from public.identities where provider = p_provider and subject = p_subject;
  if v_id is null then
    insert into public.profiles (display_name, avatar_url, role)
    values (nullif(left(btrim(coalesce(p_display_name, '')), 60), ''), p_avatar_url,
            case when p_role in ('user', 'uploader', 'admin') then p_role else 'user' end)
    returning id into v_id;
    insert into public.identities (provider, subject, profile_id) values (p_provider, p_subject, v_id);
  end if;
  select * into v_row from public.profiles where id = v_id;
  return v_row;
end
$$;

create or replace function public.claim_upload_job(p_worker text, p_lease_seconds int)
returns public.upload_jobs
language plpgsql security definer set search_path = public
as $$
declare
  v_job public.upload_jobs;
begin
  -- Expired leases that already used all 3 attempts end as failed.
  with dead as (
    update public.upload_jobs set state = 'failed', error = coalesce(error, 'Timed out'), updated_at = now()
    where state = 'running' and lease_until < now() and attempts >= 3
    returning track_id
  )
  update public.tracks set status = 'failed', error = coalesce(error, 'Timed out')
  where id in (select track_id from dead);

  update public.upload_jobs j
  set state = 'running', attempts = j.attempts + 1, claimed_by = p_worker,
      lease_until = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  where j.id = (
    select id from public.upload_jobs
    where (state = 'queued' or (state = 'running' and lease_until < now())) and attempts < 3
    order by created_at
    for update skip locked
    limit 1
  )
  returning j.* into v_job;

  if v_job.id is not null then
    update public.tracks set status = 'processing' where id = v_job.track_id and status in ('queued', 'processing');
  end if;
  return v_job;
end
$$;

create or replace function public.complete_upload_job(
  p_job uuid, p_duration_ms int, p_waveform smallint[], p_files jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_track uuid;
begin
  update public.upload_jobs set state = 'done', lease_until = null, error = null, updated_at = now()
  where id = p_job returning track_id into v_track;
  if v_track is null then raise exception 'upload job not found'; end if;

  insert into public.track_files (track_id, kind, path, size_bytes, codec, bitrate_kbps, content_type)
  select v_track, f ->> 'kind', f ->> 'path', (f ->> 'size_bytes')::bigint, f ->> 'codec',
         (f ->> 'bitrate_kbps')::int, f ->> 'content_type'
  from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) f
  on conflict (track_id, kind) do update
    set path = excluded.path, size_bytes = excluded.size_bytes, codec = excluded.codec,
        bitrate_kbps = excluded.bitrate_kbps, content_type = excluded.content_type;

  update public.tracks set status = 'ready', duration_ms = p_duration_ms, waveform = p_waveform, error = null
  where id = v_track and status in ('queued', 'processing', 'failed');
end
$$;

-- Retries until 3 attempts, then the job and the track end as failed.
create or replace function public.fail_upload_job(p_job uuid, p_error text) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_job public.upload_jobs;
begin
  select * into v_job from public.upload_jobs where id = p_job for update;
  if v_job.id is null then raise exception 'upload job not found'; end if;
  if v_job.attempts >= 3 then
    update public.upload_jobs set state = 'failed', error = left(p_error, 500), lease_until = null, updated_at = now()
    where id = p_job;
    update public.tracks set status = 'failed', error = left(p_error, 500) where id = v_job.track_id;
  else
    update public.upload_jobs set state = 'queued', error = left(p_error, 500), lease_until = null, updated_at = now()
    where id = p_job;
  end if;
end
$$;

-- Cross-instance counter. Returns true while the caller is within the limit.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits (key, window_start, count) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into v_count;
  return v_count <= p_limit;
end
$$;

create or replace function public.bump_usage(p_profile uuid, p_field text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_field not in ('plays', 'uploads', 'ai_count') then raise exception 'unknown usage field'; end if;
  execute format(
    'insert into public.usage_daily (profile_id, day, %1$I) values ($1, current_date, 1)
     on conflict (profile_id, day) do update set %1$I = public.usage_daily.%1$I + 1', p_field
  ) using p_profile;
end
$$;

create or replace function public.record_egress(p_provider text, p_bytes bigint) returns void
language sql security definer set search_path = public
as $$
  insert into public.egress_daily (day, provider, bytes) values (current_date, p_provider, p_bytes)
  on conflict (day, provider) do update set bytes = public.egress_daily.bytes + excluded.bytes
$$;

-- Top tracks by plays in the last p_days. Reads play_history of everyone, so security definer; ready tracks only.
create or replace function public.popular_tracks(p_language text, p_days int, p_limit int)
returns setof public.tracks
language sql stable security definer set search_path = public
as $$
  select t.* from public.tracks t
  left join (
    select track_id, count(*) c from public.play_history
    where played_at > now() - make_interval(days => p_days) group by track_id
  ) h on h.track_id = t.id
  where t.status = 'ready' and (p_language is null or t.language = p_language)
  order by coalesce(h.c, 0) desc, t.plays desc, t.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;

-- Trigram plus prefix search. Security invoker: RLS already hides tracks that are not ready.
create or replace function public.search_tracks(p_q text, p_language text, p_limit int, p_offset int)
returns setof public.tracks
language sql stable set search_path = public, extensions
as $$
  with q as (select lower(btrim(normalize(coalesce(p_q, ''), NFKC))) as n)
  select t.* from public.tracks t, q
  where q.n <> '' and t.status = 'ready'
    and (p_language is null or t.language = p_language)
    and (t.search_text ilike '%' || replace(replace(replace(q.n, '\', '\\'), '%', '\%'), '_', '\_') || '%'
         or t.search_text operator(extensions.%) q.n)
  order by (t.search_text like replace(replace(replace(q.n, '\', '\\'), '%', '\%'), '_', '\_') || '%') desc,
           (t.title ilike replace(replace(replace(q.n, '\', '\\'), '%', '\%'), '_', '\_') || '%') desc,
           extensions.similarity(t.search_text, q.n) desc, t.plays desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;

-- Daily Mix 1 to 3, 25 songs each, from favourite artists, history, likes and language.
create or replace function public.generate_daily_mix(p_profile uuid) returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_total int;
begin
  delete from public.playlists where owner_id = p_profile and kind = 'daily_mix';

  create temp table if not exists _mix (track_id uuid, rn int) on commit drop;
  truncate _mix;

  insert into _mix (track_id, rn)
  with me as (select music_languages, favourite_artists from public.profiles where id = p_profile),
  taste as (
    select lower(btrim(normalize(a, NFKC))) as artist_key, null::text as genre from me, unnest(me.favourite_artists) a
    union all
    select t.artist_key, t.genre from public.favorites f join public.tracks t on t.id = f.track_id where f.profile_id = p_profile
    union all
    select t.artist_key, t.genre from public.play_history h join public.tracks t on t.id = h.track_id
      where h.profile_id = p_profile and h.outcome <> 'skipped' and h.played_at > now() - interval '90 days'
  ),
  scored as (
    select t.id,
      (case when t.artist_key in (select artist_key from taste) then 3 else 0 end)
      + (case when t.language = any (me.music_languages) then 1 else 0 end)
      + (case when t.genre is not null and t.genre in (select genre from taste) then 1 else 0 end) as score
    from public.tracks t cross join me where t.status = 'ready'
  )
  select id, row_number() over (order by score desc, md5(id::text || p_profile::text || current_date::text))
  from scored where score > 0
  order by 2 limit 75;

  with mixes as (
    insert into public.playlists (owner_id, name, kind, mix_index)
    select p_profile, 'Daily Mix ' || i, 'daily_mix', i from generate_series(1, 3) i
    returning id, mix_index
  )
  insert into public.playlist_tracks (playlist_id, track_id, position)
  select m.id, x.track_id, (x.rn - 1) / 3
  from _mix x join mixes m on m.mix_index = ((x.rn - 1) % 3) + 1;

  delete from public.playlists p
  where p.owner_id = p_profile and p.kind = 'daily_mix'
    and not exists (select 1 from public.playlist_tracks pt where pt.playlist_id = p.id);

  select count(*) into v_total from _mix;
  return v_total;
end
$$;

create or replace function public.join_jam(p_code text) returns public.jams
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := public.uid();
  v_jam public.jams;
begin
  if v_me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into v_jam from public.jams where code = upper(btrim(p_code)) for update;
  if v_jam.id is null then raise exception 'jam not found' using errcode = 'P0002'; end if;
  if v_jam.ended_at is not null then raise exception 'jam ended' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.jam_members where jam_id = v_jam.id and profile_id = v_me and left_at is null)
     and (select count(*) from public.jam_members where jam_id = v_jam.id and left_at is null) >= 8 then
    raise exception 'jam is full' using errcode = 'P0001';
  end if;
  insert into public.jam_members (jam_id, profile_id) values (v_jam.id, v_me)
  on conflict (jam_id, profile_id) do update set left_at = null,
    joined_at = case when public.jam_members.left_at is null then public.jam_members.joined_at else now() end;
  return v_jam;
end
$$;

-- The removal transaction (docs/09). Returns the storage paths; the server then deletes the objects.
create or replace function public.remove_track(p_track uuid, p_admin uuid) returns setof text
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.tracks where id = p_track) then raise exception 'track not found'; end if;
  update public.tracks set status = 'removed', removed_at = now(), removed_by = p_admin where id = p_track;
  delete from public.playlist_tracks where track_id = p_track;
  delete from public.favorites where track_id = p_track;
  delete from public.jam_queue where track_id = p_track;
  update public.jams set track_id = null where track_id = p_track;
  update public.reports set status = 'removed', handled_by = p_admin, handled_at = now()
  where track_id = p_track and status = 'open';
  insert into public.admin_log (admin_id, action, target_type, target_id) values (p_admin, 'remove_track', 'track', p_track::text);
  delete from public.track_lyrics where track_id = p_track;
  return query delete from public.track_files where track_id = p_track returning path;
end
$$;

-- Friends who are listening now, honouring each friend's privacy setting.
create or replace function public.friend_activity()
returns table (profile_id uuid, track_id uuid, listening_since timestamptz)
language sql stable security definer set search_path = public
as $$
  select p.id, d.listening_track_id, d.listening_since
  from public.devices d
  join public.profiles p on p.id = d.profile_id
  where public.uid() is not null
    and p.show_listening = 'friends'
    and d.listening_track_id is not null
    and d.last_seen_at > now() - interval '2 minutes'
    and public.are_friends(public.uid(), p.id)
$$;

-- Grants: nothing is executable by default.
do $$
declare
  f text;
begin
  foreach f in array array[
    'is_jam_member(uuid)', 'are_friends(uuid,uuid)', 'ensure_profile(text,text,text,text,text)',
    'claim_upload_job(text,int)', 'complete_upload_job(uuid,int,smallint[],jsonb)', 'fail_upload_job(uuid,text)',
    'rate_limit_hit(text,int,int)', 'bump_usage(uuid,text)', 'record_egress(text,bigint)',
    'popular_tracks(text,int,int)', 'search_tracks(text,text,int,int)', 'generate_daily_mix(uuid)',
    'join_jam(text)', 'remove_track(uuid,uuid)', 'friend_activity()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
grant execute on function public.is_jam_member(uuid) to authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.popular_tracks(text, int, int) to anon, authenticated;
grant execute on function public.search_tracks(text, text, int, int) to anon, authenticated;
grant execute on function public.join_jam(text) to authenticated;
grant execute on function public.friend_activity() to authenticated;
