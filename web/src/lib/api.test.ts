import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, callApi } from './api';

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = 'https://dev-api.listengeet.com/';
});
afterEach(() => vi.unstubAllGlobals());

describe('callApi', () => {
  it('sends the bearer token and JSON body to the API origin', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ username: 'hardeep' }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const out = await callApi('/api/me/username', {
      method: 'PUT',
      body: { username: 'hardeep' },
      token: async () => 'jwt',
    });
    expect(out).toEqual({ username: 'hardeep' });
    const [url, init] = f.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe('https://dev-api.listengeet.com/api/me/username');
    expect(init.headers.Authorization).toBe('Bearer jwt');
    expect(init.headers['Content-Type']).toBe('application/json');
  });
  it('sends no Authorization header for a guest call', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await callApi('/api/artists/top');
    expect(
      (f.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers.Authorization,
    ).toBeUndefined();
  });
  it('turns the documented error shape into an ApiError with the plain message', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 'invalid', message: '@hardeep is taken.' } }),
            { status: 422 },
          ),
        ),
    );
    const err = await callApi('/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: 'invalid', message: '@hardeep is taken.' });
  });
  it('says so plainly when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
    expect(await callApi('/x').catch((e) => e)).toMatchObject({
      status: 0,
      message: "Can't reach Geet. Check your connection.",
    });
  });
});
