import { describe, expect, it } from 'vitest';
import { isPreviewLimitReached } from './PlayerProvider';

describe('guest preview boundary', () => {
  it('keeps playback open before 40 seconds and gates at the limit', () => {
    expect(isPreviewLimitReached(39.99)).toBe(false);
    expect(isPreviewLimitReached(40)).toBe(true);
    expect(isPreviewLimitReached(42)).toBe(true);
  });
});
