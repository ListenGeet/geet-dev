import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const api = process.env.API_URL?.replace(/\/$/, '');
const secret = process.env.WORKER_SECRET;
const lanes = Math.max(1, Math.min(3, Number(process.env.LANES ?? 3)));
const budget = Math.max(10, Math.min(480, Number(process.env.BUDGET_SECONDS ?? 480))) * 1000;
if (!api || !secret) throw new Error('API_URL and WORKER_SECRET are required');

function run(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'], ...options });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve(stdout.trim()) : reject(new Error('Media processing failed')),
    );
  });
}

async function call(path, body) {
  const response = await fetch(`${api}/api/worker/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Worker API returned ${response.status}`);
  return response.json();
}

async function encode(job) {
  const dir = await mkdtemp(join(tmpdir(), 'geet-'));
  try {
    const source = join(dir, 'source');
    const response = await fetch(job.sourceUrl);
    if (!response.ok) throw new Error('Source download failed');
    await writeFile(source, Buffer.from(await response.arrayBuffer()));
    const probeText = await run('ffprobe', [
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      source,
    ]);
    const probe = JSON.parse(probeText);
    if (!probe.streams?.some((stream) => stream.codec_type === 'audio'))
      throw new Error('No audio stream');
    const duration = Number(probe.format?.duration ?? 0);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 900)
      throw new Error('Invalid duration');
    const full = join(dir, 'full.m4a');
    const preview = join(dir, 'preview.m4a');
    const cover = join(dir, 'cover.jpg');
    const waveformFile = join(dir, 'wave.raw');
    const fadeAt = Math.max(0, Math.min(38, Math.min(duration, 40) - 2));
    const base = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      source,
      '-vn',
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
    ];
    await Promise.all([
      run('ffmpeg', [...base, full]),
      run('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        source,
        '-t',
        '40',
        '-vn',
        '-map_metadata',
        '-1',
        '-af',
        `afade=t=out:st=${fadeAt}:d=2`,
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
      run('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        source,
        '-an',
        '-map',
        '0:v:0?',
        '-frames:v',
        '1',
        '-vf',
        'scale=600:600:force_original_aspect_ratio=increase,crop=600:600',
        '-q:v',
        '4',
        cover,
      ]).catch(() => null),
      run('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        source,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '8000',
        '-f',
        's16le',
        waveformFile,
      ]),
    ]);
    const bins = await readFile(waveformFile);
    const samples = Math.floor(bins.length / 2);
    const waveform = Array.from({ length: 64 }, (_, i) => {
      const start = Math.floor((i * samples) / 64);
      const end = Math.floor(((i + 1) * samples) / 64);
      let peak = 0;
      for (let n = start; n < end; n++) peak = Math.max(peak, Math.abs(bins.readInt16LE(n * 2)));
      return Math.round((peak / 32768) * 100);
    });
    const uploads = [];
    for (const kind of ['full', 'preview', 'cover']) {
      const path = kind === 'cover' ? cover : join(dir, `${kind}.m4a`);
      let size;
      try {
        size = (await stat(path)).size;
      } catch {
        if (kind === 'cover') continue;
        throw new Error('Encoded file missing');
      }
      const grant = job.uploads[kind];
      const put = await fetch(grant.url, {
        method: grant.method ?? 'PUT',
        headers: grant.headers,
        body: await readFile(path),
      });
      if (!put.ok) throw new Error('Output upload failed');
      uploads.push([kind, size]);
    }
    const fileData = Object.fromEntries(
      uploads.map(([kind, size]) => [
        kind,
        { size, codec: kind === 'cover' ? 'jpeg' : 'aac', bitrate: kind === 'cover' ? null : 128 },
      ]),
    );
    await call('complete', {
      jobId: job.job.id,
      durationMs: Math.round(duration * 1000),
      waveform,
      files: fileData,
      tags: {},
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function processOne() {
  const job = await call('claim', { worker: randomUUID() });
  if (!job) return false;
  const heartbeat = setInterval(() => {
    void call('heartbeat', { jobId: job.job.id }).catch(() => {});
  }, 60_000);
  try {
    await encode(job);
  } catch {
    await call('fail', { jobId: job.job.id, error: "We couldn't read this file." }).catch(() => {});
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

const until = Date.now() + budget;
while (Date.now() < until) {
  const found = await Promise.all(Array.from({ length: lanes }, processOne));
  if (!found.some(Boolean)) break;
}
