-- Phase 3: count a play when the API grants an audio URL (guests and members).
create or replace function public.record_track_play(p_track uuid) returns void
language sql security definer set search_path = public
as $$
  update public.tracks set plays = plays + 1 where id = p_track and status = 'ready';
$$;

revoke all on function public.record_track_play(uuid) from public, anon, authenticated;
grant execute on function public.record_track_play(uuid) to service_role;
