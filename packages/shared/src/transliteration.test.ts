import { describe, expect, it } from 'vitest';
import { romanizeIndic } from './transliteration';

describe('romanizeIndic', () => {
  it('creates a readable Gurmukhi search key', () => {
    expect(romanizeIndic('ਗੀਤ')).toBe('geet');
    expect(romanizeIndic('ਦਿਲ')).toBe('dil');
  });

  it('creates a readable Devanagari search key', () => {
    expect(romanizeIndic('दिल')).toBe('dil');
  });

  it('leaves Latin titles to their existing search value', () => {
    expect(romanizeIndic('Morning Loop')).toBeNull();
  });
});
