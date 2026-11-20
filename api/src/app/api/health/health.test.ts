import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, OPTIONS } from './route';

const pingDb = vi.hoisted(() => vi.fn());
vi.mock('@/lib/repo', () => ({ pingDb }));

const req = (origin?: string, method = 'GET') =>
  new Request('https://dev-api.listengeet.com/api/health', {
    method,
    headers: origin ? { origin } : {},
  });

describe('GET /api/health', () => {
  const saved = process.env.CORS_ORIGINS;
  beforeEach(() => {
    pingDb.mockResolvedValue(true);
    process.env.CORS_ORIGINS = 'https://dev.listengeet.com,http://localhost:3000';
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = saved;
  });

  it('answers ok with a version, db up and no store', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.db).toBe('up');
    expect(typeof body.version).toBe('string');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 503 with db down when the database cannot be reached', async () => {
    pingDb.mockResolvedValue(false);
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, db: 'down' });
    pingDb.mockRejectedValue(new Error('boom'));
    expect((await GET(req())).status).toBe(503);
  });

  it('adds CORS headers for an allowed origin', async () => {
    const res = await GET(req('https://dev.listengeet.com'));
    expect(res.headers.get('access-control-allow-origin')).toBe('https://dev.listengeet.com');
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('adds no CORS headers for a disallowed origin', async () => {
    const res = await GET(req('https://evil.example.com'));
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('adds no CORS headers when CORS_ORIGINS is unset', async () => {
    delete process.env.CORS_ORIGINS;
    expect(
      (await GET(req('https://dev.listengeet.com'))).headers.get('access-control-allow-origin'),
    ).toBeNull();
  });

  it('preflight: allowed origin gets 204 with methods, headers and a one day cache', () => {
    const res = OPTIONS(req('http://localhost:3000', 'OPTIONS'));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toBe(
      'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    );
    expect(res.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');
    expect(res.headers.get('access-control-max-age')).toBe('86400');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('preflight: disallowed origin gets 403', () => {
    expect(OPTIONS(req('https://evil.example.com', 'OPTIONS')).status).toBe(403);
  });
});
