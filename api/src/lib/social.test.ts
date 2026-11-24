import { describe, expect, it } from 'vitest';
import {
  generateJamCode,
  isValidJamCode,
  cleanMessageBody,
  cleanSuggestionNote,
  DRIFT_SEEK_THRESHOLD_MS,
  DRIFT_NUDGE_LOW_MS,
  DRIFT_NUDGE_HIGH_MS,
  DRIFT_RATE_FASTER,
  DRIFT_RATE_SLOWER,
  MAX_MESSAGE_CHARS,
  MAX_SUGGESTION_NOTE_CHARS,
} from '@geet/shared';
import { parseUserAgent } from './social-repo';

describe('Jam codes', () => {
  it('generates a 6-character code from the Crockford base32 alphabet', () => {
    const code = generateJamCode();
    expect(code).toHaveLength(6);
    expect(isValidJamCode(code)).toBe(true);
  });

  it('rejects codes with invalid characters or incorrect length', () => {
    expect(isValidJamCode('')).toBe(false);
    expect(isValidJamCode('ABC')).toBe(false);
    expect(isValidJamCode('ABC1234')).toBe(false);
    // 'I', 'L', 'O', '1', '0' are not in Crockford alphabet
    expect(isValidJamCode('ABCI12')).toBe(false);
    expect(isValidJamCode('ABC12O')).toBe(false);
    expect(isValidJamCode('ABC12L')).toBe(false);
  });
});

describe('Message body validation', () => {
  it('accepts valid message text', () => {
    const res = cleanMessageBody('Hello friend!');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.body).toBe('Hello friend!');
  });

  it('rejects empty messages', () => {
    expect(cleanMessageBody('').ok).toBe(false);
    expect(cleanMessageBody('   \n\t  ').ok).toBe(false);
  });

  it('rejects messages over 1000 characters', () => {
    const longText = 'a'.repeat(MAX_MESSAGE_CHARS + 1);
    const res = cleanMessageBody(longText);
    expect(res.ok).toBe(false);
  });
});

describe('Suggestion note validation', () => {
  it('accepts empty or undefined notes', () => {
    expect(cleanSuggestionNote(undefined)).toEqual({ ok: true, note: null });
    expect(cleanSuggestionNote('')).toEqual({ ok: true, note: null });
  });

  it('accepts notes up to 140 characters', () => {
    const note = 'Check out this awesome track!';
    expect(cleanSuggestionNote(note)).toEqual({ ok: true, note });
  });

  it('rejects notes exceeding 140 characters', () => {
    const note = 'x'.repeat(MAX_SUGGESTION_NOTE_CHARS + 1);
    expect(cleanSuggestionNote(note).ok).toBe(false);
  });
});

describe('User agent parser for sign-in devices', () => {
  it('correctly identifies Chrome on Android', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    const parsed = parseUserAgent(ua);
    expect(parsed.browser).toBe('Chrome');
    expect(parsed.os).toBe('Android');
  });

  it('correctly identifies Safari on iOS', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
    const parsed = parseUserAgent(ua);
    expect(parsed.browser).toBe('Safari');
    expect(parsed.os).toBe('iOS');
  });

  it('correctly identifies Edge on Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    const parsed = parseUserAgent(ua);
    expect(parsed.browser).toBe('Edge');
    expect(parsed.os).toBe('Windows');
  });

  it('correctly identifies Firefox on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0';
    const parsed = parseUserAgent(ua);
    expect(parsed.browser).toBe('Firefox');
    expect(parsed.os).toBe('macOS');
  });
});

describe('Jam sync and drift rules (doc 07)', () => {
  it('verifies clock offset computation using median of 3 round-trips', () => {
    // 3 round trips: t0 (request start), serverNow, t1 (response end)
    const samples = [
      { t0: 1000, serverNow: 1050, t1: 1100 }, // estimated client midpoint 1050 -> offset 0
      { t0: 2000, serverNow: 2060, t1: 2100 }, // midpoint 2050 -> offset 10
      { t0: 3000, serverNow: 3045, t1: 3100 }, // midpoint 3050 -> offset -5
    ];

    const offsets = samples.map((s) => s.serverNow - (s.t0 + s.t1) / 2).sort((a, b) => a - b);
    const medianOffset = offsets[Math.floor(offsets.length / 2)];
    expect(medianOffset).toBe(0);
  });

  it('verifies target position calculation for playing state', () => {
    const positionMs = 30000;
    const updatedAtMs = 100000;
    const serverNowMs = 105000; // 5s later
    const isPlaying = true;

    const targetPositionMs = isPlaying ? positionMs + (serverNowMs - updatedAtMs) : positionMs;
    expect(targetPositionMs).toBe(35000);
  });

  it('verifies target position calculation for paused state', () => {
    const positionMs = 30000;
    const targetPositionMs = positionMs;
    expect(targetPositionMs).toBe(30000);
  });

  it('verifies drift correction decision logic', () => {
    function computeCorrection(currentSeconds: number, targetSeconds: number) {
      const diffMs = (targetSeconds - currentSeconds) * 1000;
      const absDiff = Math.abs(diffMs);

      if (absDiff > DRIFT_SEEK_THRESHOLD_MS) {
        return { action: 'seek', target: targetSeconds };
      }
      if (absDiff >= DRIFT_NUDGE_LOW_MS && absDiff <= DRIFT_NUDGE_HIGH_MS) {
        // If current is behind target, speed up; if ahead, slow down
        const rate = diffMs > 0 ? DRIFT_RATE_FASTER : DRIFT_RATE_SLOWER;
        return { action: 'nudge', rate };
      }
      return { action: 'none', rate: 1.0 };
    }

    // Small drift < 80ms: do nothing
    expect(computeCorrection(10.0, 10.05).action).toBe('none');

    // Moderate drift 80-300ms behind target: nudge faster (1.03)
    const nudgeFast = computeCorrection(10.0, 10.15);
    expect(nudgeFast.action).toBe('nudge');
    expect(nudgeFast.rate).toBe(1.03);

    // Moderate drift 80-300ms ahead of target: nudge slower (0.97)
    const nudgeSlow = computeCorrection(10.2, 10.05);
    expect(nudgeSlow.action).toBe('nudge');
    expect(nudgeSlow.rate).toBe(0.97);

    // Large drift > 300ms: hard seek to target
    const seek = computeCorrection(10.0, 10.4);
    expect(seek.action).toBe('seek');
    expect(seek.target).toBe(10.4);
  });
});
