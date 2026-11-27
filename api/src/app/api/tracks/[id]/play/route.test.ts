import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  afterCallbacks: [] as (() => Promise<void>)[],
  authenticate: vi.fn(),
  limited: vi.fn(),
  loadProfile: vi.fn(),
  signDownload: vi.fn(),
  rpc: vi.fn(),
  track: { id: 'track-id', status: 'ready' } as { id: string; status: string } | null,
  files: [
    { kind: 'full', path: 'tracks/full.m4a', size_bytes: 123 },
    { kind: 'preview', path: 'tracks/preview.m4a', size_bytes: 45 },
  ] as { kind: string; path: string; size_bytes: number }[],
  trackError: null as { message: string } | null,
  filesError: null as { message: string } | null,
  blocked: null as Response | null,
  lookupTables: [] as string[],
  egressRows: [] as { bytes: number }[],
}));

vi.mock('next/server', () => ({
  after: (callback: () => Promise<void>) => state.afterCallbacks.push(callback),
}));
vi.mock('@/lib/auth', () => ({ authenticate: state.authenticate }));
vi.mock('@/lib/route', () => ({ limited: state.limited }));
vi.mock('@/lib/me', () => ({ loadOrCreateProfile: state.loadProfile }));
vi.mock('@/lib/storage', () => ({
  storage: () => ({ signDownload: state.signDownload }),
}));
vi.mock('@/lib/db', () => ({
  db: () => ({
    from: (table: string) => {
      state.lookupTables.push(table);
      const result =
        table === 'tracks'
          ? state.track
          : table === 'egress_daily'
            ? state.egressRows
            : state.files;
      const error = table === 'tracks' ? state.trackError : state.filesError;
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        gte: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: result, error }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: result, error }).then(resolve),
      };
      return query;
    },
    rpc: state.rpc,
  }),
}));

import { GET } from './route';

const trackId = '123e4567-e89b-42d3-a456-426614174000';
const call = () => new Request(`https://api.example.test/api/tracks/${trackId}/play`);
const params = { params: Promise.resolve({ id: trackId }) };
const profile = { id: 'profile-id' };

beforeEach(() => {
  state.afterCallbacks.length = 0;
  state.lookupTables.length = 0;
  state.egressRows = [];
  state.authenticate.mockReset().mockResolvedValue(null);
  state.limited.mockReset().mockResolvedValue(null);
  state.loadProfile.mockReset().mockResolvedValue(profile);
  state.signDownload.mockReset().mockResolvedValue('https://storage.example.test/signed');
  state.rpc.mockReset().mockResolvedValue({ error: null });
  state.track = { id: trackId, status: 'ready' };
  state.files = [
    { kind: 'full', path: 'tracks/full.m4a', size_bytes: 123 },
    { kind: 'preview', path: 'tracks/preview.m4a', size_bytes: 45 },
  ];
  state.trackError = null;
  state.filesError = null;
  state.blocked = null;
  process.env.CORS_ORIGINS = 'https://app.example.test';
  process.env.STORAGE_PROVIDER = 'supabase';
});

describe('GET /api/tracks/{id}/play', () => {
  it('gives guests only the preview and keeps the response shape and headers', async () => {
    const response = await GET(call(), params);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      url: 'https://storage.example.test/signed',
      preview: true,
      expiresAt: expect.any(String),
    });
    expect(Object.keys(body)).toEqual(['url', 'expiresAt', 'preview']);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(state.signDownload).toHaveBeenCalledWith('tracks/preview.m4a', 7200);
    expect(state.afterCallbacks).toHaveLength(1);
  });

  it('gives signed-in callers the full file', async () => {
    state.authenticate.mockResolvedValue({ sub: 'clerk-user' });
    const response = await GET(call(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ preview: false });
    expect(state.loadProfile).toHaveBeenCalledWith('clerk-user');
    expect(state.signDownload).toHaveBeenCalledWith('tracks/full.m4a', 7200);
  });

  it('limits full downloads to previews after the monthly egress cap', async () => {
    state.authenticate.mockResolvedValue({ sub: 'clerk-user' });
    state.egressRows = [{ bytes: 5 * 1024 ** 3 }];
    const response = await GET(call(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ preview: true, egressLimited: true });
    expect(state.signDownload).toHaveBeenCalledWith('tracks/preview.m4a', 7200);
  });

  it('never gives guests a full file, even if there is no preview', async () => {
    state.files = [{ kind: 'full', path: 'tracks/full.m4a', size_bytes: 123 }];
    const response = await GET(call(), params);
    expect(response.status).toBe(404);
    expect(state.signDownload).not.toHaveBeenCalled();
  });

  it.each(['missing', 'removed', 'hidden'])('returns not_found for a %s track', async (status) => {
    state.track = status === 'missing' ? null : { id: trackId, status };
    const response = await GET(call(), params);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'not_found', message: 'That song is not available.' },
    });
  });

  it('returns 429 before starting track or file lookups', async () => {
    state.blocked = new Response(null, { status: 429 });
    state.limited.mockResolvedValue(state.blocked);
    const response = await GET(call(), params);
    expect(response).toBe(state.blocked);
    expect(state.lookupTables).toEqual([]);
  });

  it('runs counters after a successful response for guests and signed-in callers', async () => {
    const guestResponse = await GET(call(), params);
    expect(guestResponse.status).toBe(200);
    await state.afterCallbacks.shift()?.();
    expect(state.rpc.mock.calls.map(([name]) => name)).toEqual([
      'record_track_play',
      'record_egress',
    ]);
    expect(state.rpc).toHaveBeenCalledWith('record_egress', {
      p_provider: 'supabase',
      p_bytes: 45,
    });

    state.authenticate.mockResolvedValue({ sub: 'clerk-user' });
    const userResponse = await GET(call(), params);
    expect(userResponse.status).toBe(200);
    await state.afterCallbacks.shift()?.();
    expect(state.rpc.mock.calls.slice(2).map(([name]) => name)).toEqual([
      'record_track_play',
      'record_egress',
      'bump_usage',
    ]);
    expect(state.rpc).toHaveBeenCalledWith('bump_usage', {
      p_profile: profile.id,
      p_field: 'plays',
    });
  });

  it('keeps the response successful and logs the message if a counter throws', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.rpc.mockRejectedValueOnce(new Error('counter unavailable'));
    const response = await GET(call(), params);
    expect(response.status).toBe(200);
    await state.afterCallbacks.shift()?.();
    expect(log).toHaveBeenCalledWith('[api] play counter error:', 'counter unavailable');
    log.mockRestore();
  });
});
