-- API requests are authenticated with Clerk and use the Supabase service-role client.
-- Pass the verified profile explicitly instead of relying on auth.uid(), which is null
-- for service-role requests.
create or replace function public.join_jam_for_profile(p_code text, p_profile uuid)
returns public.jams
language plpgsql security definer set search_path = public
as $$
declare
  v_jam public.jams;
begin
  if p_profile is null then
    raise exception 'profile is required' using errcode = '22023';
  end if;

  select * into v_jam
  from public.jams
  where code = upper(btrim(p_code))
  for update;

  if v_jam.id is null then
    raise exception 'jam not found' using errcode = 'P0002';
  end if;
  if v_jam.ended_at is not null then
    raise exception 'jam ended' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.jam_members
    where jam_id = v_jam.id and profile_id = p_profile and left_at is null
  ) and (
    select count(*) from public.jam_members
    where jam_id = v_jam.id and left_at is null
  ) >= 8 then
    raise exception 'jam is full' using errcode = 'P0001';
  end if;

  insert into public.jam_members (jam_id, profile_id)
  values (v_jam.id, p_profile)
  on conflict (jam_id, profile_id) do update
    set left_at = null,
        joined_at = case
          when public.jam_members.left_at is null then public.jam_members.joined_at
          else now()
        end;

  return v_jam;
end;
$$;

revoke all on function public.join_jam_for_profile(text, uuid) from public, anon, authenticated;
grant execute on function public.join_jam_for_profile(text, uuid) to service_role;
