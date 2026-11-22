import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile(join(process.cwd(), 'api/.env.local'));
if (process.env.STORAGE_PROVIDER === 'b2')
  throw new Error('Run the tone seed with STORAGE_PROVIDER=supabase.');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Supabase seed environment is incomplete.');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = client.storage.from(process.env.STORAGE_BUCKET || 'audio');
const names = [
  'ਗੀਤ',
  'Soft Signal',
  'Golden Hour',
  'Quiet Lines',
  'Blue Window',
  'Small Orbit',
  'After Rain',
  'Open Road',
  'Slow Current',
  'First Light',
  'Warm Static',
  'Night Garden',
];
const colors = [
  '#ffdc00',
  '#e77d27',
  '#4f83cc',
  '#a95ec6',
  '#38a18c',
  '#d45b65',
  '#78943c',
  '#d19838',
  '#456d9d',
  '#9b6b4e',
  '#a64f82',
  '#557a73',
];
function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error('ffmpeg could not generate a tone.')),
    );
  });
}
const dir = await mkdtemp(join(tmpdir(), 'geet-tones-'));
try {
  for (let index = 0; index < names.length; index++) {
    const id = randomUUID();
    const frequency = 180 + index * 23;
    const source = join(dir, `${id}.wav`);
    const full = join(dir, `${id}-full.m4a`);
    const preview = join(dir, `${id}-preview.m4a`);
    const cover = join(dir, `${id}.jpg`);
    const wave = join(dir, `${id}.raw`);
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${frequency}:duration=45`,
      '-c:a',
      'pcm_s16le',
      source,
    ]);
    await Promise.all([
      ffmpeg([
        '-i',
        source,
        '-map_metadata',
        '-1',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ar',
        '44100',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        full,
      ]),
      ffmpeg([
        '-i',
        source,
        '-t',
        '40',
        '-map_metadata',
        '-1',
        '-af',
        'afade=t=out:st=38:d=2',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ar',
        '44100',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        preview,
      ]),
      ffmpeg([
        '-f',
        'lavfi',
        '-i',
        `color=c=${colors[index]}:s=600x600`,
        '-frames:v',
        '1',
        '-q:v',
        '4',
        cover,
      ]),
      ffmpeg(['-i', source, '-ac', '1', '-ar', '8000', '-f', 's16le', wave]),
    ]);
    const raw = await readFile(wave);
    const sampleCount = Math.floor(raw.length / 2);
    const waveform = Array.from({ length: 64 }, (_, bin) => {
      const start = Math.floor((bin * sampleCount) / 64);
      const end = Math.floor(((bin + 1) * sampleCount) / 64);
      let peak = 0;
      for (let sample = start; sample < end; sample++)
        peak = Math.max(peak, Math.abs(raw.readInt16LE(sample * 2)));
      return Math.round((peak * 100) / 32768);
    });
    const files = [
      {
        kind: 'full',
        path: `tracks/${id}/full.m4a`,
        file: full,
        type: 'audio/mp4',
        codec: 'aac',
        bitrate: 128,
      },
      {
        kind: 'preview',
        path: `tracks/${id}/preview.m4a`,
        file: preview,
        type: 'audio/mp4',
        codec: 'aac',
        bitrate: 128,
      },
      {
        kind: 'cover',
        path: `covers/${id}.jpg`,
        file: cover,
        type: 'image/jpeg',
        codec: 'jpeg',
        bitrate: null,
      },
    ];
    const track = {
      id,
      title: names[index],
      artist: 'Geet Tone Lab',
      album: 'Generated Tones',
      language: index === 0 ? 'pa' : 'en',
      genre: 'Ambient',
      status: 'ready',
      duration_ms: 45000,
      waveform,
      ...(index === 0 ? { translit: 'geet' } : {}),
    };
    const { error: trackError } = await client.from('tracks').insert(track);
    if (trackError) throw new Error(`Track seed failed: ${trackError.message}`);
    try {
      const rows = [];
      for (const file of files) {
        const bytes = await readFile(file.file);
        const { error } = await bucket.upload(file.path, bytes, {
          contentType: file.type,
          upsert: true,
        });
        if (error) throw new Error(`Tone storage upload failed: ${error.message}`);
        rows.push({
          track_id: id,
          kind: file.kind,
          path: file.path,
          size_bytes: (await stat(file.file)).size,
          codec: file.codec,
          bitrate_kbps: file.bitrate,
          content_type: file.type,
        });
      }
      const { error } = await client.from('track_files').insert(rows);
      if (error) throw new Error(`Tone file record failed: ${error.message}`);
      if (index < 3) {
        const lines = [
          { t_ms: 0, line: 'A note finds its way.' },
          { t_ms: 12_000, line: 'The room grows quiet.' },
          { t_ms: 24_000, line: 'The rhythm carries on.' },
          { t_ms: 36_000, line: 'Then the sound fades.' },
        ];
        const { error: lyricsError } = await client.from('track_lyrics').insert({
          track_id: id,
          plain: lines.map((line) => line.line).join('\n'),
          synced: lines,
        });
        if (lyricsError) throw new Error(`Tone lyrics seed failed: ${lyricsError.message}`);
      }
    } catch (error) {
      await bucket.remove(files.map((file) => file.path));
      await client.from('tracks').delete().eq('id', id);
      throw error;
    }
  }
  console.log(`Seeded ${names.length} generated-tone tracks.`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
