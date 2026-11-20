import { describe, expect, it } from 'vitest';
import {
  isDevHost,
  isUuid,
  normalizeUsername,
  parseProfilePatch,
  usernameProblem,
} from './profile';

describe('usernames', () => {
  it('normalises case, spaces and a leading @', () => {
    expect(normalizeUsername('  @Hardeep ')).toBe('hardeep');
  });
  it.each([
    ['ab', 'too_short'],
    ['a'.repeat(21), 'too_long'],
    ['has space', 'characters'],
    ['Upper', 'characters'],
    ['dash-name', 'characters'],
    ['admin', 'reserved'],
    ['geet', 'reserved'],
  ])('%s is refused (%s)', (name, problem) => {
    expect(usernameProblem(name)).toBe(problem);
  });
  it.each(['hardeep', 'h_s.1', 'abc', 'a'.repeat(20)])('%s is fine', (name) => {
    expect(usernameProblem(name)).toBeNull();
  });
});

describe('parseProfilePatch', () => {
  it('accepts the documented fields', () => {
    const r = parseProfilePatch({
      displayName: '  Hardeep   Singh ',
      language: 'pa',
      musicLanguages: ['pa', 'hi', 'pa'],
      favouriteArtists: ['Diljit Dosanjh'],
      emailNews: false,
      onboarded: true,
    });
    expect(r).toEqual({
      ok: true,
      value: {
        displayName: 'Hardeep Singh',
        language: 'pa',
        musicLanguages: ['pa', 'hi'],
        favouriteArtists: ['Diljit Dosanjh'],
        emailNews: false,
        onboarded: true,
      },
    });
  });
  it('refuses fields the user may not change', () => {
    for (const key of ['role', 'username', 'id', 'welcomeSentAt', 'usernameChangedAt']) {
      expect(parseProfilePatch({ [key]: 'x' }).ok).toBe(false);
    }
  });
  it('refuses wrong types and empty bodies', () => {
    expect(parseProfilePatch({ language: 'fr' }).ok).toBe(false);
    expect(parseProfilePatch({ emailNews: 'yes' }).ok).toBe(false);
    expect(parseProfilePatch({ onboarded: false }).ok).toBe(false);
    expect(parseProfilePatch({ favouriteArtists: Array(51).fill('a') }).ok).toBe(false);
    expect(parseProfilePatch({}).ok).toBe(false);
    expect(parseProfilePatch(null).ok).toBe(false);
    expect(parseProfilePatch([]).ok).toBe(false);
  });
});

describe('helpers', () => {
  it('checks uuids', () => {
    expect(isUuid('00000000-0000-0000-0000-0000000000a1')).toBe(true);
    expect(isUuid('nope')).toBe(false);
  });
  it('recognises dev hosts', () => {
    expect(isDevHost('https://dev.listengeet.com')).toBe(true);
    expect(isDevHost('https://dev-api.listengeet.com')).toBe(true);
    expect(isDevHost('http://localhost:3001')).toBe(true);
    expect(isDevHost('https://listengeet.com')).toBe(false);
    expect(isDevHost(undefined)).toBe(false);
  });
});
