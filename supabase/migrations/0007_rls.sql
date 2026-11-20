-- 0007 · row level security on every table in public (docs/13)
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles: a user reads and edits only their own row. Others come through public_profiles.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select public.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select public.uid())) with check (id = (select public.uid()));
-- Column level: role, username, username_changed_at, onboarded_at, welcome_sent_at are server-written.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, avatar_url, language, music_languages, favourite_artists, show_listening,
              accept_requests, email_news, email_news_at) on public.profiles to authenticated;

-- User data: own rows only.
do $$
declare
  r record;
begin
  for r in select * from (values
    ('favorites', 'profile_id'), ('play_history', 'profile_id'), ('search_history', 'profile_id'),
    ('devices', 'profile_id'), ('conversation_reads', 'profile_id'), ('playlists', 'owner_id')
  ) as v(tbl, col) loop
    execute format('drop policy if exists %1$I_own on public.%1$I', r.tbl);
    execute format(
      'create policy %1$I_own on public.%1$I for all to authenticated
         using (%2$I = (select public.uid())) with check (%2$I = (select public.uid()))', r.tbl, r.col);
  end loop;
end $$;

drop policy if exists playlist_tracks_own on public.playlist_tracks;
create policy playlist_tracks_own on public.playlist_tracks for all to authenticated
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = (select public.uid())))
  with check (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = (select public.uid())));

-- Catalogue: ready tracks and live promos are public.
drop policy if exists tracks_public_ready on public.tracks;
create policy tracks_public_ready on public.tracks for select to anon, authenticated
  using (status = 'ready');
drop policy if exists promos_public_active on public.promos;
create policy promos_public_active on public.promos for select to anon, authenticated
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

-- Friends, suggestions
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships for select to authenticated
  using ((select public.uid()) in (requester_id, addressee_id));
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester_id = (select public.uid()) and status = 'pending');

drop policy if exists suggestions_select on public.suggestions;
create policy suggestions_select on public.suggestions for select to authenticated
  using ((select public.uid()) in (from_id, to_id));
drop policy if exists suggestions_insert on public.suggestions;
create policy suggestions_insert on public.suggestions for insert to authenticated
  with check (from_id = (select public.uid()) and public.are_friends(from_id, to_id));

-- Conversations and messages: participants, friends only.
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
  using ((select public.uid()) in (user_a, user_b));
drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations for insert to authenticated
  with check ((select public.uid()) in (user_a, user_b) and public.are_friends(user_a, user_b));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c
                 where c.id = conversation_id and (select public.uid()) in (c.user_a, c.user_b)));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select public.uid())
    and exists (select 1 from public.conversations c
                where c.id = conversation_id and (select public.uid()) in (c.user_a, c.user_b)
                  and public.are_friends(c.user_a, c.user_b))
  );
drop policy if exists messages_update_sender on public.messages;
create policy messages_update_sender on public.messages for update to authenticated
  using (sender_id = (select public.uid())) with check (sender_id = (select public.uid()));
revoke update on public.messages from anon, authenticated;
grant update (deleted_at) on public.messages to authenticated;

-- Jams: current members only. Writes go through the API and join_jam().
drop policy if exists jams_select on public.jams;
create policy jams_select on public.jams for select to authenticated using (public.is_jam_member(id));
drop policy if exists jam_members_select on public.jam_members;
create policy jam_members_select on public.jam_members for select to authenticated using (public.is_jam_member(jam_id));
drop policy if exists jam_queue_select on public.jam_queue;
create policy jam_queue_select on public.jam_queue for select to authenticated using (public.is_jam_member(jam_id));
drop policy if exists jam_queue_insert on public.jam_queue;
create policy jam_queue_insert on public.jam_queue for insert to authenticated
  with check (added_by = (select public.uid()) and public.is_jam_member(jam_id));

-- Everything else (identities, push_tokens, sign_in_devices, email_*, track_files, track_lyrics,
-- reports, upload_jobs, admin_log, usage_daily, rate_limits, egress_daily): RLS on, no policies.
-- Writes by clients are removed even where a policy would otherwise allow them.
revoke insert, update, delete on public.tracks, public.promos from anon, authenticated;
revoke insert, update, delete on public.friendships, public.suggestions, public.conversations,
  public.jams, public.jam_members from anon, authenticated;
revoke insert, update, delete on public.jam_queue from anon;
grant insert on public.friendships, public.suggestions, public.conversations, public.jam_queue to authenticated;
revoke all on all tables in schema public from anon;
grant select on public.tracks, public.promos to anon;
