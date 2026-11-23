import { db } from './db';

/** Every database call the API makes in Phase 1. Server code only: this uses the service-role client. */

export interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'uploader' | 'admin';
  language: 'en' | 'pa' | 'hi';
  music_languages: string[];
  favourite_artists: string[];
  show_listening: 'friends' | 'nobody';
  accept_requests: 'everyone' | 'nobody';
  onboarded_at: string | null;
  username_changed_at: string | null;
  email_news: boolean;
  autoplay_similar: boolean;
  show_lyrics: boolean;
  keep_screen_awake: boolean;
  email_news_at: string | null;
  welcome_sent_at: string | null;
  created_at: string;
}

function check<T = unknown>(
  res: { data: unknown; error: { message: string; code?: string } | null },
  what: string,
): T | null {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T | null;
}

export async function profileBySubject(sub: string): Promise<ProfileRow | null> {
  const identity = check<{ profile_id: string }>(
    await db()
      .from('identities')
      .select('profile_id')
      .eq('provider', 'clerk')
      .eq('subject', sub)
      .maybeSingle(),
    'identity lookup',
  );
  if (!identity) return null;
  return check<ProfileRow>(
    await db().from('profiles').select('*').eq('id', identity.profile_id).maybeSingle(),
    'profile read',
  );
}

export async function ensureProfile(
  sub: string,
  displayName: string | null,
  avatarUrl: string | null,
  role: 'user' | 'admin',
): Promise<ProfileRow> {
  const row = check<ProfileRow>(
    await db().rpc('ensure_profile', {
      p_provider: 'clerk',
      p_subject: sub,
      p_display_name: displayName,
      p_avatar_url: avatarUrl,
      p_role: role,
    }),
    'ensure_profile',
  );
  if (!row) throw new Error('ensure_profile: no row');
  return row;
}

export async function updateProfile(
  id: string,
  columns: Record<string, unknown>,
): Promise<ProfileRow> {
  const row = check<ProfileRow>(
    await db().from('profiles').update(columns).eq('id', id).select('*').single(),
    'profile update',
  );
  if (!row) throw new Error('profile update: no row');
  return row;
}

/** Returns false when the name is taken (unique violation). */
export async function writeUsername(
  id: string,
  username: string,
  stampChange: boolean,
): Promise<boolean> {
  const columns: Record<string, unknown> = { username };
  if (stampChange) columns.username_changed_at = new Date().toISOString();
  const res = await db().from('profiles').update(columns).eq('id', id);
  if (res.error?.code === '23505') return false;
  if (res.error) throw new Error(`username update: ${res.error.message}`);
  return true;
}

export async function usernameOwner(username: string): Promise<string | null> {
  const row = check<{ id: string }>(
    await db().from('profiles').select('id').eq('username', username).maybeSingle(),
    'username lookup',
  );
  return row?.id ?? null;
}

export async function publicProfile(
  username: string,
): Promise<{ username: string; displayName: string | null; avatarUrl: string | null } | null> {
  const row = check<{ username: string; display_name: string | null; avatar_url: string | null }>(
    await db()
      .from('public_profiles')
      .select('username, display_name, avatar_url')
      .eq('username', username)
      .maybeSingle(),
    'public profile',
  );
  return row
    ? { username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url }
    : null;
}

export async function counts(
  id: string,
): Promise<{ favourites: number; playlists: number; friends: number }> {
  const head = { count: 'exact' as const, head: true };
  const [fav, pl, fr] = await Promise.all([
    db().from('favorites').select('*', head).eq('profile_id', id),
    db().from('playlists').select('*', head).eq('owner_id', id).eq('kind', 'user'),
    db()
      .from('friendships')
      .select('*', head)
      .eq('status', 'accepted')
      .or(`requester_id.eq.${id},addressee_id.eq.${id}`),
  ]);
  for (const r of [fav, pl, fr]) if (r.error) throw new Error(`counts: ${r.error.message}`);
  return { favourites: fav.count ?? 0, playlists: pl.count ?? 0, friends: fr.count ?? 0 };
}

export async function topArtists(
  languages: string[],
  limit: number,
): Promise<{ artist: string; artistKey: string; plays: number }[]> {
  const rows = check<{ artist: string; artist_key: string; plays: number }[]>(
    await db().rpc('top_artists', {
      p_languages: languages.length ? languages : null,
      p_limit: limit,
    }),
    'top_artists',
  );
  return (rows ?? []).map((r) => ({
    artist: r.artist,
    artistKey: r.artist_key,
    plays: Number(r.plays),
  }));
}

/** True when the call is allowed. A database error never blocks a person: it is logged and let through. */
export async function rateLimitHit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const res = await db().rpc('rate_limit_hit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (res.error) {
    console.error('[api] rate_limit_hit failed:', res.error.message);
    return true;
  }
  return res.data === true;
}

export async function bumpUsage(
  profileId: string,
  field: 'plays' | 'uploads' | 'ai_count',
): Promise<void> {
  check(await db().rpc('bump_usage', { p_profile: profileId, p_field: field }), 'bump_usage');
}

export async function pingDb(): Promise<boolean> {
  const res = await db().from('rate_limits').select('key', { head: true, count: 'exact' }).limit(1);
  return !res.error;
}

// --- account deletion -------------------------------------------------------------------------

/** Removes the profile and, through cascades, favourites, playlists, history, messages, friendships. */
export async function deleteProfile(id: string): Promise<void> {
  check(await db().from('profiles').delete().eq('id', id), 'profile delete');
}

export async function uploadedTrackIds(id: string): Promise<string[]> {
  const rows = check<{ id: string }[]>(
    await db().from('tracks').select('id').eq('uploader_id', id).neq('status', 'removed'),
    'uploads read',
  );
  return (rows ?? []).map((r) => r.id);
}

export async function removeTrack(trackId: string, adminId: string | null): Promise<string[]> {
  const paths = check<string[]>(
    await db().rpc('remove_track', { p_track: trackId, p_admin: adminId }),
    'remove_track',
  );
  return paths ?? [];
}

// --- email ------------------------------------------------------------------------------------

/** Sets welcome_sent_at only if it is still empty. True means this call won the right to send. */
export async function claimWelcome(id: string): Promise<boolean> {
  const rows = check<{ id: string }[]>(
    await db()
      .from('profiles')
      .update({ welcome_sent_at: new Date().toISOString() })
      .eq('id', id)
      .is('welcome_sent_at', null)
      .select('id'),
    'welcome claim',
  );
  return (rows ?? []).length === 1;
}

export async function releaseWelcome(id: string): Promise<void> {
  check(
    await db().from('profiles').update({ welcome_sent_at: null }).eq('id', id),
    'welcome release',
  );
}

export async function isSuppressed(id: string): Promise<boolean> {
  const row = check<{ reason: string }>(
    await db().from('email_suppressions').select('reason').eq('profile_id', id).maybeSingle(),
    'suppression read',
  );
  return row !== null;
}

export interface JobRow {
  id: string;
  state: 'queued' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
}

/** Inserts the job once per idempotency key and returns the stored row, new or old. */
export async function upsertEmailJob(job: {
  kind: string;
  template: string;
  profileId: string | null;
  priority: number;
  idempotencyKey: string;
}): Promise<JobRow> {
  const insert = await db().from('email_jobs').upsert(
    {
      kind: job.kind,
      template: job.template,
      profile_id: job.profileId,
      priority: job.priority,
      idempotency_key: job.idempotencyKey,
    },
    { onConflict: 'idempotency_key', ignoreDuplicates: true },
  );
  if (insert.error) throw new Error(`email job insert: ${insert.error.message}`);
  const row = check<JobRow>(
    await db()
      .from('email_jobs')
      .select('id, state, attempts')
      .eq('idempotency_key', job.idempotencyKey)
      .single(),
    'email job read',
  );
  if (!row) throw new Error('email job read: no row');
  return row;
}

export async function finishEmailJob(
  jobId: string,
  state: 'sent' | 'failed' | 'cancelled',
  attempts: number,
  log: { template: string; profileId: string | null; resendId: string | null; status: string },
): Promise<void> {
  check(
    await db().from('email_jobs').update({ state, attempts }).eq('id', jobId),
    'email job update',
  );
  // No address and no body in the log, ever (docs/13).
  check(
    await db().from('email_log').insert({
      job_id: jobId,
      template: log.template,
      profile_id: log.profileId,
      resend_id: log.resendId,
      status: log.status,
    }),
    'email log insert',
  );
}
