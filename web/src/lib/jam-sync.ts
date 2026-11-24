import {
  DRIFT_SEEK_THRESHOLD_MS,
  DRIFT_NUDGE_LOW_MS,
  DRIFT_NUDGE_HIGH_MS,
  DRIFT_RATE_FASTER,
  DRIFT_RATE_SLOWER,
  DRIFT_NUDGE_DURATION_MS,
} from '@geet/shared';

/**
 * Jam synchronization algorithm exactly as in doc 07:
 * 1. Clock offset: calls /api/time 3 times on joining (and every 5 minutes),
 *    taking median of `serverNow - (t0 + t1) / 2`.
 * 2. Target position: if playing, `position_ms + (serverNow - updated_at)`; if paused, `position_ms`.
 * 3. Drift correction every 5s:
 *    - |audio.currentTime - target| > 300ms: hard seek
 *    - 80ms to 300ms: nudge playbackRate to 1.03 or 0.97 for 3s, then return to 1
 */

export class JamSyncEngine {
  private clockOffsetMs = 0;
  private offsetInterval: ReturnType<typeof setInterval> | null = null;
  private driftInterval: ReturnType<typeof setInterval> | null = null;
  private nudgeTimeout: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  constructor(
    private fetchTime: () => Promise<number>,
    private getAudioElement: () => HTMLAudioElement | null,
    private onSeekNeeded: (targetSec: number) => void,
  ) {}

  public async start(): Promise<void> {
    this.stopped = false;
    await this.syncClockOffset();
    if (this.stopped) return;

    // Re-sync clock offset every 5 minutes
    this.offsetInterval = setInterval(
      () => {
        void this.syncClockOffset();
      },
      5 * 60 * 1000,
    );
  }

  public stop(): void {
    this.stopped = true;
    if (this.offsetInterval) clearInterval(this.offsetInterval);
    if (this.driftInterval) clearInterval(this.driftInterval);
    if (this.nudgeTimeout) clearTimeout(this.nudgeTimeout);
  }

  public async syncClockOffset(): Promise<number> {
    const samples: number[] = [];

    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      try {
        const serverNow = await this.fetchTime();
        const t1 = Date.now();
        const roundTripMidpoint = (t0 + t1) / 2;
        samples.push(serverNow - roundTripMidpoint);
      } catch {
        // ignore network hiccups
      }
    }

    if (samples.length > 0) {
      samples.sort((a, b) => a - b);
      const median = samples[Math.floor(samples.length / 2)];
      if (median !== undefined) this.clockOffsetMs = median;
    }

    return this.clockOffsetMs;
  }

  public getServerNow(): number {
    return Date.now() + this.clockOffsetMs;
  }

  public computeTargetPositionMs(
    positionMs: number,
    isPlaying: boolean,
    updatedAtIso: string,
  ): number {
    if (!isPlaying) return positionMs;
    const updatedAtMs = new Date(updatedAtIso).getTime();
    const elapsedSinceUpdate = Math.max(0, this.getServerNow() - updatedAtMs);
    return positionMs + elapsedSinceUpdate;
  }

  public startDriftCorrection(getTargetSec: () => number, isPlaying: () => boolean): void {
    if (this.driftInterval) clearInterval(this.driftInterval);

    this.driftInterval = setInterval(() => {
      if (!isPlaying()) return;

      const audio = this.getAudioElement();
      if (!audio || audio.paused) return;

      const currentSec = audio.currentTime;
      const targetSec = getTargetSec();
      const diffMs = (targetSec - currentSec) * 1000;
      const absDiffMs = Math.abs(diffMs);

      // Log drift measurement
      console.log(
        `[jam-drift] current: ${currentSec.toFixed(3)}s, target: ${targetSec.toFixed(3)}s, drift: ${diffMs.toFixed(1)}ms`,
      );

      if (absDiffMs > DRIFT_SEEK_THRESHOLD_MS) {
        this.onSeekNeeded(targetSec);
      } else if (absDiffMs >= DRIFT_NUDGE_LOW_MS && absDiffMs <= DRIFT_NUDGE_HIGH_MS) {
        const rate = diffMs > 0 ? DRIFT_RATE_FASTER : DRIFT_RATE_SLOWER;
        audio.playbackRate = rate;

        if (this.nudgeTimeout) clearTimeout(this.nudgeTimeout);
        this.nudgeTimeout = setTimeout(() => {
          if (audio) audio.playbackRate = 1.0;
        }, DRIFT_NUDGE_DURATION_MS);
      }
    }, 5000);
  }
}
