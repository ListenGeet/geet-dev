import { describe, expect, it, vi } from 'vitest';
import { findLyrics, normalizeLyrics } from './lyrics';

describe('lyrics import', () => {
  it('normalizes synced LRC lines to Geet timestamps', () => {
    expect(normalizeLyrics('[00:01.25] First line\n[00:02.50] Second line')).toEqual({
      plain: 'First line\nSecond line',
      synced: [
        { t_ms: 1250, line: 'First line' },
        { t_ms: 2500, line: 'Second line' },
      ],
    });
  });

  it('keeps plain lyrics when timestamps are absent', () => {
    expect(normalizeLyrics('First line\nSecond line')).toEqual({
      plain: 'First line\nSecond line',
      synced: null,
    });
  });

  it('uses the fallback only when LyricsLIB has no result', async () => {
    const primary = vi.fn().mockResolvedValue(null);
    const fallback = vi.fn().mockResolvedValue('Fallback lyrics');

    await expect(findLyrics('Song', 'Artist', primary, fallback)).resolves.toEqual({
      plain: 'Fallback lyrics',
      synced: null,
      source: 'lyrics_ovh',
    });
    expect(primary).toHaveBeenCalledWith('Song', 'Artist');
    expect(fallback).toHaveBeenCalledWith('Song', 'Artist');
  });

  it('does not call the fallback when LyricsLIB finds lyrics', async () => {
    const primary = vi.fn().mockResolvedValue('Primary lyrics');
    const fallback = vi.fn();

    await expect(findLyrics('Song', 'Artist', primary, fallback)).resolves.toEqual({
      plain: 'Primary lyrics',
      synced: null,
      source: 'lrclib',
    });
    expect(fallback).not.toHaveBeenCalled();
  });

  it('returns null when neither lyrics source has a match', async () => {
    await expect(
      findLyrics(
        'Song',
        'Artist',
        async () => null,
        async () => null,
      ),
    ).resolves.toBeNull();
  });
});
