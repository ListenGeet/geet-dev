import { describe, expect, it } from 'vitest';
import { localUsernameHint, suggestUsername } from './username';

describe('suggestUsername', () => {
  it('lowercases and keeps only allowed characters', () => {
    expect(suggestUsername('Hardeep Singh')).toBe('hardeepsingh');
    expect(suggestUsername('h.singh_99!')).toBe('h.singh_99');
    expect(suggestUsername('A'.repeat(30))).toHaveLength(20);
  });
  it('gives nothing for empty or non-Latin input', () => {
    expect(suggestUsername(null)).toBe('');
    expect(suggestUsername('ਹਰਦੀਪ')).toBe('');
  });
});

describe('localUsernameHint', () => {
  it('is quiet for empty and valid names', () => {
    expect(localUsernameHint('')).toBeNull();
    expect(localUsernameHint('hardeep')).toBeNull();
  });
  it('explains in plain words', () => {
    expect(localUsernameHint('ab')).toBe('Usernames need at least 3 characters.');
    expect(localUsernameHint('has space')).toBe(
      'Use only letters a to z, numbers, underscore and dot.',
    );
    expect(localUsernameHint('admin')).toBe('That name is not available.');
  });
});
