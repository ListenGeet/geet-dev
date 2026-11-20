import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticate = vi.hoisted(() => vi.fn());
const repo = vi.hoisted(() => ({
  rateLimitHit: vi.fn(),
  profileBySubject: vi.fn(),
  ensureProfile: vi.fn(),
  counts: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  uploadedTrackIds: vi.fn(),
  removeTrack: vi.fn(),
  writeUsername: vi.fn(),
  usernameOwner: vi.fn(),
}));
const deleteUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ authenticate }));
vi.mock('@/lib/repo', () => repo);
vi.mock('@/lib/clerk', async (orig) => ({
  ...(await orig<typeof import('@/lib/clerk')>()),
  clerk: () => ({ users: { deleteUser } }),
  fetchPerson: vi.fn(),
}));

import { DELETE, GET, PATCH } from './route';
import { PUT } from './username/route';
import { GET as available } from '../usernames/[name]/available/route';

const profile = {
  id: 'p1',
  username: 'hardeep',
  display_name: 'Hardeep',
  avatar_url: null,
  role: 'user',
  language: 'en',
  music_languages: [],
  favourite_artists: [],
  show_listening: 'friends',
  accept_requests: 'everyone',
  onboarded_at: null,
  username_changed_at: null,
  email_news: false,
  email_news_at: null,
  welcome_sent_at: null,
  created_at: '2026-11-01T00:00:00Z',
};
const url = 'https://dev-api.listengeet.com/api/me';
const call = (method: string, body?: unknown, path = url) =>
  new Request(path, {
    method,
    headers: {
      authorization: 'Bearer t',
      origin: 'https://dev.listengeet.com',
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  Object.values(repo).forEach((m) => m.mockReset());
  deleteUser.mockReset().mockResolvedValue({});
  authenticate.mockReset().mockResolvedValue({ sub: 'user_1' });
  repo.rateLimitHit.mockResolvedValue(true);
  repo.profileBySubject.mockResolvedValue(profile);
  repo.counts.mockResolvedValue({ favourites: 0, playlists: 0, friends: 0 });
  process.env.CORS_ORIGINS = 'https://dev.listengeet.com';
});

describe('authorisation comes first', () => {
  it('401 with the documented error shape and no database work when there is no valid token', async () => {
    authenticate.mockResolvedValue(null);
    const res = await GET(call('GET'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'unauthorized', message: 'Sign in to continue.' },
    });
    expect(repo.profileBySubject).not.toHaveBeenCalled();
    expect(repo.rateLimitHit).not.toHaveBeenCalled();
  });
  it('429 with Retry-After when the rate limit is hit', async () => {
    repo.rateLimitHit.mockResolvedValue(false);
    const res = await GET(call('GET'));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(repo.profileBySubject).not.toHaveBeenCalled();
  });
});

describe('GET /api/me', () => {
  it('returns the profile with counts and CORS headers', async () => {
    const res = await GET(call('GET'));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://dev.listengeet.com');
    expect(await res.json()).toMatchObject({
      id: 'p1',
      username: 'hardeep',
      onboarded: false,
      emailNews: false,
      counts: { friends: 0 },
    });
  });
});

describe('PATCH /api/me', () => {
  it('saves allowed fields', async () => {
    repo.updateProfile.mockResolvedValue({ ...profile, language: 'pa' });
    const res = await PATCH(call('PATCH', { language: 'pa' }));
    expect(res.status).toBe(200);
    expect(repo.updateProfile).toHaveBeenCalledWith('p1', { language: 'pa' });
  });
  it('refuses role, username and unknown fields with 422', async () => {
    for (const body of [{ role: 'admin' }, { username: 'x' }, { nope: 1 }, {}]) {
      expect((await PATCH(call('PATCH', body))).status).toBe(422);
    }
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });
  it('the news toggle stays off unless it is sent as true', async () => {
    repo.updateProfile.mockResolvedValue(profile);
    await PATCH(call('PATCH', { language: 'en', onboarded: true }));
    expect(repo.updateProfile.mock.calls[0]?.[1]).not.toHaveProperty('email_news');
  });
  it('onboarding cannot finish before a username exists', async () => {
    repo.profileBySubject.mockResolvedValue({ ...profile, username: null });
    const res = await PATCH(call('PATCH', { onboarded: true }));
    expect(res.status).toBe(422);
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });
  it('rejects a body over 64 KB and bad JSON', async () => {
    expect((await PATCH(call('PATCH', { displayName: 'x'.repeat(70_000) }))).status).toBe(422);
    const bad = new Request(url, {
      method: 'PATCH',
      headers: { authorization: 'Bearer t' },
      body: '{nope',
    });
    expect((await PATCH(bad)).status).toBe(422);
  });
});

describe('PUT /api/me/username', () => {
  it('sets a username', async () => {
    repo.profileBySubject.mockResolvedValue({ ...profile, username: null });
    repo.writeUsername.mockResolvedValue(true);
    const res = await PUT(call('PUT', { username: 'Hardeep' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: 'hardeep' });
  });
  it('422 with plain words when taken', async () => {
    repo.profileBySubject.mockResolvedValue({ ...profile, username: null });
    repo.writeUsername.mockResolvedValue(false);
    const res = await PUT(call('PUT', { username: 'hardeep' }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toBe('@hardeep is taken.');
  });
});

describe('GET /api/usernames/{name}/available', () => {
  it('answers for a name', async () => {
    repo.usernameOwner.mockResolvedValue('someone');
    const res = await available(
      call('GET', undefined, 'https://x.test/api/usernames/taken_one/available'),
      { params: Promise.resolve({ name: 'taken_one' }) },
    );
    expect(await res.json()).toEqual({
      name: 'taken_one',
      available: false,
      yours: false,
      problem: null,
    });
  });
});

describe('DELETE /api/me', () => {
  it('needs the word DELETE', async () => {
    expect((await DELETE(call('DELETE', { confirm: 'delete' }))).status).toBe(422);
    expect((await DELETE(call('DELETE', {}))).status).toBe(422);
    expect(repo.deleteProfile).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it('deletes the data, then the Clerk user; uploads stay by default', async () => {
    const res = await DELETE(call('DELETE', { confirm: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(repo.removeTrack).not.toHaveBeenCalled();
    expect(repo.deleteProfile).toHaveBeenCalledWith('p1');
    expect(deleteUser).toHaveBeenCalledWith('user_1');
  });
  it('removes the person’s uploads when they choose to', async () => {
    repo.uploadedTrackIds.mockResolvedValue(['t1', 't2']);
    repo.removeTrack.mockResolvedValue([]);
    await DELETE(call('DELETE', { confirm: 'DELETE', deleteUploads: true }));
    expect(repo.removeTrack).toHaveBeenCalledTimes(2);
    expect(repo.deleteProfile).toHaveBeenCalled();
  });
  it('reports a failure when Clerk cannot delete, so the person can retry', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteUser.mockRejectedValue(new Error('clerk down'));
    expect((await DELETE(call('DELETE', { confirm: 'DELETE' }))).status).toBe(500);
    err.mockRestore();
  });
});
