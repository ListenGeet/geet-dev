-- RLS proofs (docs/13): users cannot read each other's data, strangers cannot write, server-only tables are empty to clients.
begin;

-- Fixture, as superuser.
select public.ensure_profile('clerk', 'user_a', 'Ann', null, 'user');
select public.ensure_profile('clerk', 'user_b', 'Bob', null, 'user');
select public.ensure_profile('clerk', 'user_c', 'Cy', null, 'user');

create temp table ids as
  select (select profile_id from identities where subject = 'user_a') as a,
         (select profile_id from identities where subject = 'user_b') as b,
         (select profile_id from identities where subject = 'user_c') as c;
grant select on ids to anon, authenticated;

insert into tracks (id, title, artist, status, language) values
  ('00000000-0000-0000-0000-0000000000a1', 'Ready song', 'Artist', 'ready', 'pa'),
  ('00000000-0000-0000-0000-0000000000a2', 'Hidden song', 'Artist', 'hidden', 'pa'),
  ('00000000-0000-0000-0000-0000000000a3', 'Queued song', 'Artist', 'queued', 'pa');
insert into favorites select a, '00000000-0000-0000-0000-0000000000a1' from ids;
insert into playlists (id, owner_id, name) select '00000000-0000-0000-0000-0000000000b1', a, 'Mine' from ids;
insert into playlist_tracks values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 0);
insert into play_history (profile_id, track_id, outcome) select a, '00000000-0000-0000-0000-0000000000a1', 'completed' from ids;
insert into friendships (requester_id, addressee_id, status) select a, b, 'accepted' from ids;
insert into conversations (id, user_a, user_b)
  select '00000000-0000-0000-0000-0000000000c1', least(a, b), greatest(a, b) from ids;
insert into messages (id, conversation_id, sender_id, body)
  select '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', a, 'hello' from ids;
insert into jams (id, code, host_id) select '00000000-0000-0000-0000-0000000000e1', 'ABCDEF', a from ids;
insert into jam_members (jam_id, profile_id) select '00000000-0000-0000-0000-0000000000e1', a from ids;
-- server-only rows
insert into track_files values ('00000000-0000-0000-0000-0000000000a1', 'full', 'tracks/x/full.m4a', 1, 'aac', 128, 'audio/mp4');
insert into track_lyrics values ('00000000-0000-0000-0000-0000000000a1', 'words', null);
insert into reports (track_id, kind, reason) values ('00000000-0000-0000-0000-0000000000a1', 'song', 'Spam');
insert into upload_jobs (track_id, state) values ('00000000-0000-0000-0000-0000000000a3', 'queued');
insert into admin_log (action) values ('x');
insert into usage_daily select a, current_date, 1, 0, 0 from ids;
insert into rate_limits values ('k', now(), 1);
insert into egress_daily values (current_date, 'supabase', 1);
insert into push_tokens (profile_id, kind, endpoint) select a, 'webpush', 'https://push.example/1' from ids;
insert into sign_in_devices (profile_id, fingerprint) select a, 'fp' from ids;
insert into email_jobs (kind, template, idempotency_key) values ('welcome', 'welcome', 'k1');
insert into email_log (template, status) values ('welcome', 'sent');
insert into email_suppressions select b, 'bounce' from ids;
insert into email_campaigns (template, subject) values ('marketing-announcement', 's');

-- Every table in public has RLS on.
select t.assert(
  not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  'RLS is enabled on every table in public');

-- Another user cannot read favourites, playlists, history.
select t.as_user('user_b');
select t.assert((select count(*) from favorites) = 0, 'B cannot read A''s favourites');
select t.assert((select count(*) from playlists) = 0, 'B cannot read A''s playlists');
select t.assert((select count(*) from playlist_tracks) = 0, 'B cannot read A''s playlist tracks');
select t.assert((select count(*) from play_history) = 0, 'B cannot read A''s history');
select t.assert(t.sqlstate_of($q$insert into favorites select a, '00000000-0000-0000-0000-0000000000a1' from ids$q$) in ('42501', '23505'),
  'B cannot write a favourite for A');

-- A stranger cannot read messages or write one; a friend can read and write.
select t.as_user('user_c');
select t.assert((select count(*) from messages) = 0, 'a stranger cannot read messages');
select t.assert((select count(*) from conversations) = 0, 'a stranger cannot read conversations');
select t.assert(
  t.sqlstate_of($q$insert into messages (conversation_id, sender_id, body)
    select '00000000-0000-0000-0000-0000000000c1', c, 'hi' from ids$q$) = '42501',
  'a stranger cannot insert a message');
select t.as_user('user_b');
select t.assert((select count(*) from messages) = 1, 'a friend in the conversation can read the message');
select t.assert(
  t.sqlstate_of($q$insert into messages (conversation_id, sender_id, body)
    select '00000000-0000-0000-0000-0000000000c1', a, 'spoofed' from ids$q$) = '42501',
  'a sender id that is not the caller is refused');
select t.assert(
  t.sqlstate_of($q$insert into messages (conversation_id, sender_id, body)
    select '00000000-0000-0000-0000-0000000000c1', b, 'reply' from ids$q$) = 'ok',
  'a friend can reply');
select t.assert(t.sqlstate_of($q$update messages set body = 'edited'$q$) = '42501', 'body cannot be updated');
select t.assert(t.sqlstate_of($q$update messages set deleted_at = now() where sender_id = (select b from ids)$q$) = 'ok',
  'the sender can set deleted_at on their own message');
select t.as_super();
select t.assert((select count(*) from messages where deleted_at is not null) = 1, 'only the sender''s message was touched');

-- Messages stop once the friendship is gone.
delete from friendships;
select t.as_user('user_b');
select t.assert(
  t.sqlstate_of($q$insert into messages (conversation_id, sender_id, body)
    select '00000000-0000-0000-0000-0000000000c1', b, 'after unfriend' from ids$q$) = '42501',
  'no new messages after the friendship ends');
select t.as_super();

-- Jams: members only.
select t.as_user('user_c');
select t.assert((select count(*) from jams) = 0, 'a non-member cannot read a jam');
select t.assert((select count(*) from jam_members) = 0, 'a non-member cannot read jam members');
select t.as_user('user_a');
select t.assert((select count(*) from jams) = 1, 'a member can read the jam');
select t.assert(t.sqlstate_of($q$update jams set is_playing = true$q$) = '42501', 'clients cannot update a jam directly');

-- Catalogue visibility.
select t.as_anon();
select t.assert((select count(*) from tracks) = 1, 'anon sees only the ready track');
select t.assert((select count(*) from tracks where status <> 'ready') = 0, 'tracks that are not ready are invisible to anon');
select t.assert(t.sqlstate_of('select * from favorites') = '42501', 'anon cannot touch favourites');
select t.assert(t.sqlstate_of('select * from public_profiles') = '42501', 'anon cannot read public_profiles');
select t.as_user('user_a');
select t.assert((select count(*) from tracks) = 1, 'authenticated also sees only ready tracks');
select t.assert(t.sqlstate_of($q$update tracks set title = 'x'$q$) = '42501', 'clients cannot update tracks');

-- Server-only tables return nothing to authenticated.
select t.assert((select count(*) from identities) = 0, 'identities: nothing for authenticated');
select t.assert((select count(*) from track_files) = 0, 'track_files: nothing for authenticated');
select t.assert((select count(*) from track_lyrics) = 0, 'track_lyrics: nothing for authenticated');
select t.assert((select count(*) from reports) = 0, 'reports: nothing for authenticated');
select t.assert((select count(*) from upload_jobs) = 0, 'upload_jobs: nothing for authenticated');
select t.assert((select count(*) from admin_log) = 0, 'admin_log: nothing for authenticated');
select t.assert((select count(*) from usage_daily) = 0, 'usage_daily: nothing for authenticated');
select t.assert((select count(*) from rate_limits) = 0, 'rate_limits: nothing for authenticated');
select t.assert((select count(*) from egress_daily) = 0, 'egress_daily: nothing for authenticated');
select t.assert((select count(*) from push_tokens) = 0, 'push_tokens: nothing for authenticated');
select t.assert((select count(*) from sign_in_devices) = 0, 'sign_in_devices: nothing for authenticated');
select t.assert((select count(*) from email_jobs) = 0, 'email_jobs: nothing for authenticated');
select t.assert((select count(*) from email_log) = 0, 'email_log: nothing for authenticated');
select t.assert((select count(*) from email_suppressions) = 0, 'email_suppressions: nothing for authenticated');
select t.assert((select count(*) from email_campaigns) = 0, 'email_campaigns: nothing for authenticated');
select t.assert(t.sqlstate_of($q$insert into identities values ('clerk', 'x', (select a from ids))$q$) = '42501',
  'authenticated cannot insert an identity');
select t.assert(t.sqlstate_of('select public.rate_limit_hit(''k'', 1, 60)') = '42501',
  'authenticated cannot call server-only functions');

-- Profiles: own row, safe columns only.
select t.assert((select count(*) from profiles) = 1, 'a user reads only their own profile row');
select t.assert((select count(*) from public_profiles) = 3, 'public_profiles lists names to signed-in users');
select t.assert(not exists (
  select 1 from information_schema.columns where table_name = 'public_profiles' and column_name in ('role', 'email', 'language')),
  'public_profiles exposes no role, email or language');
select t.assert(t.sqlstate_of($q$update profiles set role = 'admin'$q$) = '42501', 'a user cannot make themselves admin');
select t.assert(t.sqlstate_of($q$update profiles set username = 'sneaky'$q$) = '42501', 'username changes only through the server');
select t.assert(t.sqlstate_of($q$update profiles set username_changed_at = null$q$) = '42501', 'username_changed_at is server-only');
select t.assert(t.sqlstate_of($q$update profiles set display_name = 'Ann K', email_news = true$q$) = 'ok', 'a user can edit their own safe columns');
select t.assert(t.sqlstate_of($q$update profiles set display_name = 'Hacked' where id = (select b from ids)$q$) = 'ok'
  and (select display_name from public_profiles where id = (select b from ids)) = 'Bob', 'editing someone else''s row changes nothing');
select t.assert(t.sqlstate_of($q$delete from profiles$q$) = '42501', 'a user cannot delete profiles directly');
select t.as_super();

rollback;
