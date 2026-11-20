-- 0009 · artists for onboarding step 3: top by plays within the chosen languages (docs/05).
create or replace function public.top_artists(p_languages text[], p_limit int)
returns table (artist text, artist_key text, plays bigint)
language sql stable security definer set search_path = public
as $$
  select min(t.artist) as artist, t.artist_key, sum(t.plays)::bigint as plays
  from public.tracks t
  where t.status = 'ready' and t.artist_key <> ''
    and (p_languages is null or t.language = any (p_languages))
  group by t.artist_key
  order by sum(t.plays) desc, t.artist_key
  limit least(greatest(p_limit, 1), 50)
$$;
revoke all on function public.top_artists(text[], int) from public, anon, authenticated;
grant execute on function public.top_artists(text[], int) to service_role;
