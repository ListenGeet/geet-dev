import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  writeUsername: vi.fn(),
  usernameOwner: vi.fn(),
  profileBySubject: vi.fn(),
  ensureProfile: vi.fn(),
}));
const fetchPerson = vi.hoisted(() => vi.fn());
vi.mock('./repo', () => repo);
vi.mock('./clerk', async (orig) => ({ ...(await orig<typeof import('./clerk')>()), fetchPerson }));

import {
  checkAvailability,
  loadOrCreateProfile,
  patchToColumns,
  setUsername,
  toMe,
  usernameChangeableAt,
} from './me';
import type { ProfileRow } from './repo';

const row = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  id: 'p1',
  username: null,
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
  ...over,
});
const now = new Date('2026-11-20T12:00:00Z');

beforeEach(() => {
  Object.values(repo).forEach((m) => m.mockReset());
  fetchPerson.mockReset();
});

describe('setUsername', () => {
  it('sets a first username without starting the 30 day clock', async () => {
    repo.writeUsername.mockResolvedValue(true);
    expect(await setUsername(row(), '  @Hardeep ', now)).toEqual({ ok: true, username: 'hardeep' });
    expect(repo.writeUsername).toHaveBeenCalledWith('p1', 'hardeep', false);
  });
  it('a change stamps the clock', async () => {
    repo.writeUsername.mockResolvedValue(true);
    await setUsername(row({ username: 'old_name' }), 'new_name', now);
    expect(repo.writeUsername).toHaveBeenCalledWith('p1', 'new_name', true);
  });
  it('refuses a change inside 30 days and says when it opens', async () => {
    const r = await setUsername(
      row({ username: 'old_name', username_changed_at: '2026-11-10T00:00:00Z' }),
      'new_name',
      now,
    );
    expect(r).toEqual({
      ok: false,
      message: 'You changed your username recently. You can change it again on 2026-12-10.',
    });
    expect(repo.writeUsername).not.toHaveBeenCalled();
  });
  it('allows a change after 30 days', async () => {
    repo.writeUsername.mockResolvedValue(true);
    const r = await setUsername(
      row({ username: 'old_name', username_changed_at: '2026-10-01T00:00:00Z' }),
      'new_name',
      now,
    );
    expect(r.ok).toBe(true);
  });
  it('setting the same name again changes nothing', async () => {
    expect(await setUsername(row({ username: 'hardeep' }), 'Hardeep', now)).toEqual({
      ok: true,
      username: 'hardeep',
    });
    expect(repo.writeUsername).not.toHaveBeenCalled();
  });
  it('says plainly when the name is taken', async () => {
    repo.writeUsername.mockResolvedValue(false);
    expect(await setUsername(row(), 'hardeep', now)).toEqual({
      ok: false,
      message: '@hardeep is taken.',
    });
  });
  it('refuses bad and reserved names before touching the database', async () => {
    for (const bad of ['ab', 'has space', 'admin', 'x'.repeat(21)]) {
      expect((await setUsername(row(), bad, now)).ok).toBe(false);
    }
    expect(repo.writeUsername).not.toHaveBeenCalled();
  });
});

describe('checkAvailability', () => {
  it('reports taken, free, yours and invalid', async () => {
    repo.usernameOwner.mockResolvedValueOnce('someone-else').mockResolvedValueOnce(null);
    expect(await checkAvailability(row(), 'Hardeep')).toEqual({
      name: 'hardeep',
      available: false,
      yours: false,
      problem: null,
    });
    expect(await checkAvailability(row(), 'hardeep')).toEqual({
      name: 'hardeep',
      available: true,
      yours: false,
      problem: null,
    });
    expect(await checkAvailability(row({ username: 'hardeep' }), 'hardeep')).toEqual({
      name: 'hardeep',
      available: true,
      yours: true,
      problem: null,
    });
    expect(await checkAvailability(row(), 'a!')).toMatchObject({
      available: false,
      problem: 'too_short',
    });
  });
});

describe('patchToColumns', () => {
  it('stamps the consent time only when the news choice changes', () => {
    expect(patchToColumns(row(), { emailNews: true }, now)).toEqual({
      email_news: true,
      email_news_at: now.toISOString(),
    });
    expect(patchToColumns(row({ email_news: true }), { emailNews: true }, now)).toEqual({});
  });
  it('news stays off unless chosen', () => {
    expect(patchToColumns(row(), { language: 'pa', onboarded: true }, now)).toEqual({
      language: 'pa',
      onboarded_at: now.toISOString(),
    });
  });
  it('onboarded is stamped once', () => {
    expect(
      patchToColumns(row({ onboarded_at: '2026-11-01T00:00:00Z' }), { onboarded: true }, now),
    ).toEqual({});
  });
});

describe('toMe', () => {
  it('returns the documented shape and never an email', () => {
    const me = toMe(row({ role: 'admin', onboarded_at: '2026-11-02T00:00:00Z' }), {
      favourites: 1,
      playlists: 2,
      friends: 3,
    });
    expect(me).toMatchObject({
      role: 'admin',
      onboarded: true,
      counts: { favourites: 1, playlists: 2, friends: 3 },
      emailNews: false,
    });
    expect(JSON.stringify(me)).not.toMatch(/email(?!News)/i);
  });
  it('reports when the username can change again', () => {
    expect(
      usernameChangeableAt(
        row({ username: 'a_b', username_changed_at: '2026-11-19T00:00:00Z' }),
        now,
      ),
    ).toBe('2026-12-19T00:00:00.000Z');
    expect(usernameChangeableAt(row({ username: 'a_b' }), now)).toBeNull();
  });
});

describe('loadOrCreateProfile', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'boss@example.com';
  });
  it('returns the existing profile without calling Clerk', async () => {
    repo.profileBySubject.mockResolvedValue(row());
    await loadOrCreateProfile('user_1');
    expect(fetchPerson).not.toHaveBeenCalled();
  });
  it('creates it on first call, admin only for a verified listed address', async () => {
    repo.profileBySubject.mockResolvedValue(null);
    repo.ensureProfile.mockResolvedValue(row());
    fetchPerson.mockResolvedValue({
      displayName: 'Boss',
      avatarUrl: null,
      email: 'boss@example.com',
      emailVerified: true,
      username: null,
    });
    await loadOrCreateProfile('user_1');
    expect(repo.ensureProfile).toHaveBeenCalledWith('user_1', 'Boss', null, 'admin');
    fetchPerson.mockResolvedValue({
      displayName: 'Boss',
      avatarUrl: null,
      email: 'boss@example.com',
      emailVerified: false,
      username: null,
    });
    await loadOrCreateProfile('user_2');
    expect(repo.ensureProfile).toHaveBeenLastCalledWith('user_2', 'Boss', null, 'user');
  });
});
