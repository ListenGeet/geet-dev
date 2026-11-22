import { describe, expect, it } from 'vitest';
import { toTrackDto } from './catalogue';

describe('public catalogue track mapping', () => {
  it('returns app fields without exposing database columns', () => {
    expect(
      toTrackDto({
        id: 'track-id',
        title: 'Morning Loop',
        artist: 'Geet Tone Lab',
        album: 'Generated Tones',
        language: 'en',
        genre: 'Ambient',
        duration_ms: 45_000,
        waveform: Array.from({ length: 64 }, () => 12),
        plays: 2,
        artist_key: 'geet tone lab',
        status: 'ready',
      }),
    ).toEqual({
      id: 'track-id',
      title: 'Morning Loop',
      artist: 'Geet Tone Lab',
      album: 'Generated Tones',
      language: 'en',
      genre: 'Ambient',
      durationMs: 45_000,
      waveform: Array.from({ length: 64 }, () => 12),
      coverUrl: '/api/cover/track-id',
    });
  });
});
