-- Phase 4 library automation and playlist ordering.
alter table public.playlists drop constraint if exists playlists_name_check;
alter table public.playlists add constraint playlists_name_check check (char_length(name) between 1 and 100);
alter table public.tracks add column if not exists source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$');
create unique index if not exists tracks_uploader_source_sha256_idx on public.tracks (uploader_id, source_sha256) where source_sha256 is not null;
alter table public.profiles add column if not exists autoplay_similar boolean not null default true;
alter table public.profiles add column if not exists show_lyrics boolean not null default true;
alter table public.profiles add column if not exists keep_screen_awake boolean not null default false;
grant update (autoplay_similar, show_lyrics, keep_screen_awake) on public.profiles to authenticated;

create or replace function public.replace_playlist_tracks(p_playlist uuid, p_owner uuid, p_tracks uuid[])
returns void language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  if cardinality(coalesce(p_tracks, '{}'::uuid[])) > 500 then raise exception 'playlist limit exceeded'; end if;
  select count(distinct track_id) into v_count from unnest(coalesce(p_tracks, '{}'::uuid[])) as items(track_id);
  if v_count <> cardinality(coalesce(p_tracks, '{}'::uuid[])) then raise exception 'duplicate tracks'; end if;
  perform 1 from public.playlists where id = p_playlist and owner_id = p_owner and kind = 'user' for update;
  if not found then raise exception 'playlist not found'; end if;
  select count(*) into v_count from public.tracks where id = any(coalesce(p_tracks, '{}'::uuid[])) and status = 'ready';
  if v_count <> cardinality(coalesce(p_tracks, '{}'::uuid[])) then raise exception 'track unavailable'; end if;
  delete from public.playlist_tracks where playlist_id = p_playlist;
  insert into public.playlist_tracks (playlist_id, track_id, position)
  select p_playlist, t, ord::int - 1 from unnest(coalesce(p_tracks, '{}'::uuid[])) with ordinality as x(t, ord);
  update public.playlists set updated_at = now() where id = p_playlist;
end $$;

create or replace function public.daily_mix_candidates()
returns table(profile_id uuid) language sql stable security definer set search_path = public
as $$
  select p.id from public.profiles p
  where (select count(*) from public.favorites f where f.profile_id = p.id)
      + (select count(*) from public.play_history h where h.profile_id = p.id and h.played_at > now() - interval '90 days') >= 5
$$;

create or replace function public.cleanup_retained_data()
returns void language plpgsql security definer set search_path = public
as $$
begin
  delete from public.play_history where played_at < now() - interval '12 months';
  delete from public.search_history where created_at < now() - interval '12 months';
  delete from public.rate_limits where window_start < now() - interval '1 day';
  delete from public.email_log where created_at < now() - interval '90 days';
  delete from public.sign_in_devices where last_seen < now() - interval '90 days';
  delete from public.upload_jobs where state in ('done', 'failed') and updated_at < now() - interval '14 days';
  update public.jams set ended_at = now(), is_playing = false, version = version + 1
    where ended_at is null and updated_at < now() - interval '6 hours';
  delete from public.jams where ended_at < now() - interval '30 days';
end $$;

revoke all on function public.replace_playlist_tracks(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.daily_mix_candidates() from public, anon, authenticated;
revoke all on function public.cleanup_retained_data() from public, anon, authenticated;
grant execute on function public.replace_playlist_tracks(uuid, uuid, uuid[]) to service_role;
grant execute on function public.daily_mix_candidates() to service_role;
grant execute on function public.cleanup_retained_data() to service_role;
