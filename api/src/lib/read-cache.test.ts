import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedRead } from './read-cache';

describe('cachedRead', () => {
  afterEach(() => vi.useRealTimers());

  it('coalesces simultaneous reads and reuses the short-lived result', async () => {
    let calls = 0;
    let release!: (value: string) => void;
    const load = () => {
      calls++;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    };

    const first = cachedRead('read-cache:test:coalesce', load);
    const second = cachedRead('read-cache:test:coalesce', load);
    expect(calls).toBe(0);
    await Promise.resolve();
    expect(calls).toBe(1);
    release('ready');
    await expect(Promise.all([first, second])).resolves.toEqual(['ready', 'ready']);
    await expect(cachedRead('read-cache:test:coalesce', load)).resolves.toBe('ready');
    expect(calls).toBe(1);
  });

  it('retries after a failed load and expires successful values', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const load = async () => {
      calls++;
      if (calls === 1) throw new Error('temporary');
      return calls;
    };

    await expect(cachedRead('read-cache:test:expiry', load)).rejects.toThrow('temporary');
    await expect(cachedRead('read-cache:test:expiry', load)).resolves.toBe(2);
    vi.setSystemTime(Date.now() + 5_001);
    await expect(cachedRead('read-cache:test:expiry', load)).resolves.toBe(3);
  });
});
