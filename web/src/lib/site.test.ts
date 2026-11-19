import { describe, expect, it } from 'vitest';
import { isDevSite } from './site';

describe('isDevSite', () => {
  it('is true for dev.listengeet.com', () =>
    expect(isDevSite('https://dev.listengeet.com')).toBe(true));
  it('is false for production and for nothing', () => {
    expect(isDevSite('https://listengeet.com')).toBe(false);
    expect(isDevSite(undefined)).toBe(false);
    expect(isDevSite('not a url')).toBe(false);
  });
});
