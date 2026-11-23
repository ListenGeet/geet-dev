import { incomingKey, trackFileKey, coverKey } from '@geet/shared';
import { db } from './db';
import { storage } from './storage';
import type { ProfileRow } from './repo';

export type UploadTrack = {
  id: string;
  uploader_id: string;
  title: string;
  artist: string;
  album: string | null;
  status: string;
  error: string | null;
  created_at: string;
};
export function row<T>(
  result: { data: unknown; error: { message: string } | null },
  label: string,
): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data as T;
}

export function mayUpload(profile: ProfileRow): boolean {
  const mode = process.env.UPLOAD_MODE ?? 'admin';
  return (
    mode === 'anyone' ||
    (mode === 'approved' && profile.role !== 'user') ||
    (mode === 'admin' && profile.role === 'admin')
  );
}

export async function createUpload(
  profile: ProfileRow,
  input: {
    size: number;
    contentType: string;
    title: string;
    artist: string;
    album?: string;
    translit?: string;
    sourceSha256?: string;
  },
) {
  const max = Math.min(Number(process.env.MAX_TRACK_MB ?? 50), 50) * 1024 * 1024;
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > max)
    throw new Error('size');
  const mime = input.contentType.toLowerCase();
  if (!(mime.startsWith('audio/') || mime === 'application/octet-stream')) throw new Error('type');
  const limit = Math.max(1, Number(process.env.MAX_UPLOADS_PER_DAY ?? 5));
  const today = new Date().toISOString().slice(0, 10);
  const daily = row<{ uploads: number } | null>(
    await db()
      .from('usage_daily')
      .select('uploads')
      .eq('profile_id', profile.id)
      .eq('day', today)
      .maybeSingle(),
    'upload usage',
  );
  if ((daily?.uploads ?? 0) >= limit) throw new Error('daily');
  const track = row<UploadTrack>(
    await db()
      .from('tracks')
      .insert({
        uploader_id: profile.id,
        title: input.title,
        artist: input.artist,
        album: input.album ?? null,
        translit: input.translit ?? null,
        status: 'uploading',
        source_sha256: input.sourceSha256 ?? null,
      })
      .select('*')
      .single(),
    'track create',
  );
  try {
    row(
      await db().from('upload_jobs').insert({
        track_id: track.id,
        expected_size: input.size,
        source_content_type: input.contentType,
      }),
      'upload job create',
    );
    const key = incomingKey(profile.id, track.id);
    const grant = await storage().signUpload(key, mime, 900);
    return { track, key, grant };
  } catch (error) {
    await db().from('tracks').delete().eq('id', track.id);
    throw error;
  }
}

export async function dispatchTranscode() {
  const token = process.env.GH_DISPATCH_TOKEN;
  const repo = process.env.GH_REPO;
  if (!token || !repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    console.error('[uploads] transcode dispatch not configured', {
      missingToken: !token,
      invalidOrMissingRepo: !repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo),
    });
    return false;
  }
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'transcode',
        client_payload: { env: process.env.APP_ENV === 'production' ? 'production' : 'dev' },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 204)
      console.error('[uploads] transcode dispatch rejected by GitHub', { status: response.status });
    return response.status === 204;
  } catch {
    console.error('[uploads] transcode dispatch request failed');
    return false;
  }
}

export async function deleteTrack(track: UploadTrack) {
  const files = row<{ path: string }[]>(
    await db().from('track_files').select('path').eq('track_id', track.id),
    'track files',
  );
  await storage().remove([
    incomingKey(track.uploader_id, track.id),
    ...files.map((f) => f.path),
    coverKey(track.id),
    trackFileKey(track.id, 'full'),
    trackFileKey(track.id, 'preview'),
  ]);
  row(await db().from('tracks').delete().eq('id', track.id), 'track delete');
}
