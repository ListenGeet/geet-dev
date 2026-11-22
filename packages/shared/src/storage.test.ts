import { describe, expect, it } from 'vitest';
import { coverKey, incomingKey, trackFileKey } from './storage';

describe('storage keys', () => {
  const user = '00000000-0000-4000-8000-000000000001';
  const track = '00000000-0000-4000-8000-000000000002';

  it('keeps uploads and processed files under the documented prefixes', () => {
    expect(incomingKey(user, track)).toBe(`incoming/${user}/${track}`);
    expect(trackFileKey(track, 'full')).toBe(`tracks/${track}/full.m4a`);
    expect(trackFileKey(track, 'preview')).toBe(`tracks/${track}/preview.m4a`);
    expect(coverKey(track)).toBe(`covers/${track}.jpg`);
  });

  it('rejects keys built from untrusted path segments', () => {
    expect(() => incomingKey('../user', track)).toThrow('Invalid storage id');
    expect(() => trackFileKey(track, 'full;delete' as 'full')).toThrow('Invalid storage kind');
  });
});
