-- Functions and constraints (docs/13).
begin;

select public.ensure_profile('clerk', 'user_a', 'Ann', null, 'user');
select public.ensure_profile('clerk', 'user_b', 'Bob', null, 'user');
create temp table ids as
  select (select profile_id from identities where subject = 'user_a') as a,
         (select profile_id from identities where subject = 'user_b') as b;
grant select on ids to authenticated, service_role;

-- ensure_profile is idempotent and the role is applied once.
select t.assert((select count(*) from profiles) = 2, 'ensure_profile creates one profile per identity');
select public.ensure_profile('clerk', 'user_a', 'Other name', null, 'admin');
select t.assert((select count(*) from profiles) = 2 and (select role from profiles where id = (select a from ids)) = 'user',
  'a second ensure_profile call changes nothing');

-- Constraints.
select t.assert(t.sqlstate_of($q$update profiles set username = 'Bad Name' where id = (select a from ids)$q$) = '23514', 'username format is enforced');
select t.assert(t.sqlstate_of($q$update profiles set username = 'ab' where id = (select a from ids)$q$) = '23514', 'username needs 3 characters');
select t.assert(t.sqlstate_of($q$update profiles set username = 'ann_k.1' where id = (select a from ids)$q$) = 'ok', 'a valid username is accepted');
select t.assert(t.sqlstate_of($q$update profiles set username = 'ann_k.1' where id = (select b from ids)$q$) = '23505', 'usernames are unique');
select t.assert(t.sqlstate_of($q$insert into profiles (role) values ('owner')$q$) = '23514', 'role is limited to user, uploader, admin');

insert into friendships (requester_id, addressee_id) select a, b from ids;
select t.assert(t.sqlstate_of($q$insert into friendships (requester_id, addressee_id) select b, a from ids$q$) = '23505',
  'one friendship row per pair, whichever way round');
select t.assert(t.sqlstate_of($q$insert into conversations (user_a, user_b) select greatest(a, b), least(a, b) from ids$q$) = '23514',
  'conversations require user_a < user_b');
select t.assert(t.sqlstate_of($q$insert into jams (code, host_id) select 'ABC1OL', a from ids$q$) = '23514', 'jam codes exclude confusable characters');

-- tracks: derived keys and search.
insert into tracks (id, title, artist, translit, status, language, genre, plays) values
  ('00000000-0000-0000-0000-000000000001', 'ਦਿਲ', 'Diljit Dosanjh', 'Dil', 'ready', 'pa', 'pop', 5),
  ('00000000-0000-0000-0000-000000000002', 'Lover', 'Diljit Dosanjh', null, 'ready', 'pa', 'pop', 50),
  ('00000000-0000-0000-0000-000000000003', 'Tum Hi Ho', 'Arijit Singh', null, 'ready', 'hi', 'romance', 9),
  ('00000000-0000-0000-0000-000000000004', 'Secret Dil', 'Hidden Artist', null, 'hidden', 'pa', 'pop', 0);
select t.assert((select artist_key from tracks where id = '00000000-0000-0000-0000-000000000001') = 'diljit dosanjh',
  'artist_key is lower, trimmed');
insert into tracks (title, artist, status) values ('Full width', '  ＡＢＣ  ', 'ready');
select t.assert((select artist_key from tracks where title = 'Full width') = 'abc', 'artist_key is NFKC normalised');
select t.assert(exists (select 1 from search_tracks('dil', null, 10, 0) where title = 'ਦਿਲ'), 'search finds a song by its English spelling');
select t.assert((select count(*) from search_tracks('dil', 'hi', 10, 0)) = 0 and (select count(*) from search_tracks('dil', 'pa', 10, 0)) = 2,
  'search honours the language filter');
select t.assert((select count(*) from search_tracks('dilj', null, 10, 0)) = 2, 'prefix search finds both Diljit songs');
select t.assert((select count(*) from search_tracks('arijt singh', null, 10, 0)) = 1, 'a typo still finds the artist');
select t.assert((select count(*) from search_tracks('hidden', null, 10, 0)) = 0, 'search never returns tracks that are not ready');
select t.assert((select count(*) from search_tracks('100%', null, 10, 0)) = 0, 'wildcards in the query are escaped');
select t.assert((select title from popular_tracks(null, 30, 1)) = 'Lover', 'popular_tracks orders by plays');
select public.record_track_play('00000000-0000-0000-0000-000000000001');
select t.assert((select plays from tracks where id = '00000000-0000-0000-0000-000000000001') = 6,
  'record_track_play increments the ready track count atomically');

-- rate limiter.
select t.assert((select public.rate_limit_hit('ip:1', 3, 60)) and (select public.rate_limit_hit('ip:1', 3, 60))
  and (select public.rate_limit_hit('ip:1', 3, 60)), 'rate_limit_hit allows up to the limit');
select t.assert(not (select public.rate_limit_hit('ip:1', 3, 60)), 'rate_limit_hit refuses beyond the limit');
select t.assert((select public.rate_limit_hit('ip:2', 3, 60)), 'rate limits are per key');

-- usage and egress.
select public.bump_usage((select a from ids), 'plays');
select public.bump_usage((select a from ids), 'plays');
select public.bump_usage((select a from ids), 'ai_count');
select t.assert((select plays from usage_daily where profile_id = (select a from ids)) = 2
  and (select ai_count from usage_daily where profile_id = (select a from ids)) = 1, 'bump_usage upserts per day');
select t.assert(t.sqlstate_of($q$select public.bump_usage((select a from ids), 'plays; drop table tracks')$q$) = 'P0001', 'bump_usage rejects unknown fields');
select public.record_egress('supabase', 1000);
select public.record_egress('supabase', 500);
select t.assert((select bytes from egress_daily where provider = 'supabase') = 1500, 'record_egress adds up');

-- search_history keeps the newest 20.
insert into search_history (profile_id, query, created_at)
  select (select a from ids), 'q' || i, now() - make_interval(secs => 100 - i) from generate_series(1, 25) i;
select t.assert((select count(*) from search_history) = 20 and not exists (select 1 from search_history where query = 'q1'),
  'search_history keeps only the newest 20');

-- Upload jobs: atomic claim, lease recovery, 3 attempts.
insert into tracks (id, title, artist, status) values
  ('00000000-0000-0000-0000-0000000000f1', 'J1', 'X', 'queued'),
  ('00000000-0000-0000-0000-0000000000f2', 'J2', 'X', 'queued');
insert into upload_jobs (id, track_id, state, created_at) values
  ('00000000-0000-0000-0000-0000000001f1', '00000000-0000-0000-0000-0000000000f1', 'queued', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-0000000001f2', '00000000-0000-0000-0000-0000000000f2', 'queued', now() - interval '1 minute');
select t.assert((select id from public.claim_upload_job('w1', 60)) = '00000000-0000-0000-0000-0000000001f1', 'claim returns the oldest queued job');
select t.assert((select id from public.claim_upload_job('w2', 60)) = '00000000-0000-0000-0000-0000000001f2', 'a second claim gets the next job, not the same one');
select t.assert((select id from public.claim_upload_job('w3', 60)) is null, 'nothing left to claim');
select t.assert((select attempts from upload_jobs where id = '00000000-0000-0000-0000-0000000001f1') = 1
  and (select status from tracks where id = '00000000-0000-0000-0000-0000000000f1') = 'processing', 'claim counts the attempt and marks the track processing');
update upload_jobs set lease_until = now() - interval '1 second' where id = '00000000-0000-0000-0000-0000000001f1';
select t.assert((select id from public.claim_upload_job('w3', 60)) = '00000000-0000-0000-0000-0000000001f1', 'an expired lease is recovered');
select t.assert((select attempts from upload_jobs where id = '00000000-0000-0000-0000-0000000001f1') = 2, 'the recovered job counts a second attempt');
select public.fail_upload_job('00000000-0000-0000-0000-0000000001f2', 'ffmpeg exited 1');
select t.assert((select state from upload_jobs where id = '00000000-0000-0000-0000-0000000001f2') = 'queued', 'a failure with attempts left re-queues');
select t.assert((select id from public.claim_upload_job('w4', 60)) = '00000000-0000-0000-0000-0000000001f2', 'the re-queued job can be claimed again');
update upload_jobs set attempts = 3 where id = '00000000-0000-0000-0000-0000000001f2';
select public.fail_upload_job('00000000-0000-0000-0000-0000000001f2', 'ffmpeg exited 1');
select t.assert((select state from upload_jobs where id = '00000000-0000-0000-0000-0000000001f2') = 'failed'
  and (select status from tracks where id = '00000000-0000-0000-0000-0000000000f2') = 'failed', 'after 3 attempts the job and track fail');
select public.complete_upload_job('00000000-0000-0000-0000-0000000001f1', 180000,
  (select array_agg(i::smallint) from generate_series(1, 64) i),
  '[{"kind":"full","path":"tracks/f1/full.m4a","size_bytes":10,"codec":"aac","bitrate_kbps":128,"content_type":"audio/mp4"},
    {"kind":"preview","path":"tracks/f1/preview.m4a","size_bytes":2,"codec":"aac","bitrate_kbps":96,"content_type":"audio/mp4"}]'::jsonb);
select t.assert((select status from tracks where id = '00000000-0000-0000-0000-0000000000f1') = 'ready'
  and (select count(*) from track_files where track_id = '00000000-0000-0000-0000-0000000000f1') = 2
  and (select state from upload_jobs where id = '00000000-0000-0000-0000-0000000001f1') = 'done', 'complete_upload_job flips the track to ready and saves files');

-- Jams: capacity of 8.
insert into jams (id, code, host_id) select '00000000-0000-0000-0000-0000000000e1', 'JAMJAM', a from ids;
insert into jam_members (jam_id, profile_id) select '00000000-0000-0000-0000-0000000000e1', a from ids;
do $$
declare
  i int;
begin
  for i in 1..9 loop
    perform public.ensure_profile('clerk', 'jammer_' || i, 'J' || i, null, 'user');
  end loop;
end $$;
select t.as_user('jammer_1');
select t.assert((select id from public.join_jam('jamjam')) is not null, 'join_jam accepts the code in any case');
select t.assert((select count(*) from jams) = 1, 'a joined member can read the jam');
select t.as_super();
do $$
declare
  i int;
begin
  for i in 2..7 loop
    perform t.as_user('jammer_' || i);
    perform public.join_jam('JAMJAM');
  end loop;
  perform t.as_super();
end $$;
select t.assert((select count(*) from jam_members where left_at is null) = 8, 'the jam holds 8 members');
select t.as_user('jammer_8');
select t.assert(t.sqlstate_of($q$select public.join_jam('JAMJAM')$q$) = 'P0001', 'the 9th person is refused');
select t.as_user('jammer_1');
select t.assert(t.sqlstate_of($q$select public.join_jam('JAMJAM')$q$) = 'ok', 'a member joining again is not counted twice');
select t.assert(t.sqlstate_of($q$select public.join_jam('ZZZZZZ')$q$) = 'P0002', 'an unknown code is not found');
select t.as_super();
update jams set ended_at = now();
select t.as_user('jammer_1');
select t.assert(t.sqlstate_of($q$select public.join_jam('JAMJAM')$q$) = 'P0001', 'an ended jam cannot be joined');
select t.as_super();

-- Daily mix: 3 mixes of 25 from favourite artists.
insert into tracks (title, artist, status, language, genre)
  select 'Mix song ' || i, 'Diljit Dosanjh', 'ready', 'pa', 'pop' from generate_series(1, 90) i;
update profiles set favourite_artists = array['Diljit Dosanjh'] where id = (select a from ids);
select t.assert(public.generate_daily_mix((select a from ids)) = 75, 'generate_daily_mix picks 75 songs');
select t.assert((select count(*) from playlists where owner_id = (select a from ids) and kind = 'daily_mix') = 3, 'three Daily Mix playlists exist');
select t.assert(not exists (
  select 1 from playlist_tracks pt join playlists p on p.id = pt.playlist_id
  where p.kind = 'daily_mix' group by p.id having count(*) <> 25), 'each mix has 25 songs');
select t.assert((select count(distinct track_id) from playlist_tracks pt join playlists p on p.id = pt.playlist_id where p.kind = 'daily_mix') = 75,
  'no song repeats across the mixes');
select public.generate_daily_mix((select a from ids));
select t.assert((select count(*) from playlists where owner_id = (select a from ids) and kind = 'daily_mix') = 3, 'regenerating replaces the mixes');
select t.assert(public.generate_daily_mix((select b from ids)) = 0 and
  (select count(*) from playlists where owner_id = (select b from ids)) = 0, 'a user with no taste gets no empty mixes');

-- Friend activity honours privacy.
update friendships set status = 'accepted';
insert into devices (profile_id, name, kind, listening_track_id, listening_since)
  select b, 'Phone', 'web', '00000000-0000-0000-0000-000000000002', now() from ids;
select t.as_user('user_a');
select t.assert((select count(*) from friend_activity()) = 1, 'a friend who is listening shows in friend_activity');
select t.as_super();
update profiles set show_listening = 'nobody' where id = (select b from ids);
select t.as_user('user_a');
select t.assert((select count(*) from friend_activity()) = 0, 'show_listening = nobody hides the friend');
select t.as_super();

-- Track removal.
insert into favorites select a, '00000000-0000-0000-0000-000000000002' from ids;
insert into track_files values ('00000000-0000-0000-0000-000000000002', 'full', 'tracks/2/full.m4a', 1, 'aac', 128, 'audio/mp4');
insert into reports (track_id, kind, reason) values ('00000000-0000-0000-0000-000000000002', 'copyright', 'Copyright');
select t.assert((select count(*) from public.remove_track('00000000-0000-0000-0000-000000000002', (select b from ids))) = 1,
  'remove_track returns the storage paths to delete');
select t.assert((select status from tracks where id = '00000000-0000-0000-0000-000000000002') = 'removed'
  and (select count(*) from favorites where track_id = '00000000-0000-0000-0000-000000000002') = 0
  and (select status from reports where track_id = '00000000-0000-0000-0000-000000000002') = 'removed'
  and exists (select 1 from admin_log where action = 'remove_track'), 'remove_track removes the song everywhere and logs it');

-- top_artists for onboarding.
select t.assert((select count(*) from top_artists(null, 24)) >= 2, 'top_artists lists artists with ready songs');
select t.assert((select artist from top_artists(array['hi'], 24)) = 'Arijit Singh' and (select count(*) from top_artists(array['hi'], 24)) = 1,
  'top_artists honours the chosen languages');
select t.assert(not exists (select 1 from top_artists(null, 50) where artist = 'Hidden Artist'), 'top_artists ignores songs that are not ready');
select t.as_user('user_a');
select t.assert(t.sqlstate_of('select * from top_artists(null, 5)') = '42501', 'authenticated cannot call top_artists directly');
select t.as_super();

-- Deleting a profile removes their data.
delete from profiles where id = (select a from ids);
select t.assert(not exists (select 1 from identities where subject = 'user_a')
  and not exists (select 1 from playlists where kind = 'daily_mix' and name = 'Daily Mix 1' and owner_id not in (select id from profiles)),
  'deleting a profile removes the identity and playlists');

rollback;
