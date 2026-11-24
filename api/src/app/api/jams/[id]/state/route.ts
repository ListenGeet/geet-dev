import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { updateJamState } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      trackId?: string;
      positionMs?: number;
      isPlaying?: boolean;
      expectedVersion?: number;
    } | null;

    if (
      body === null ||
      typeof body.positionMs !== 'number' ||
      typeof body.isPlaying !== 'boolean' ||
      typeof body.expectedVersion !== 'number'
    ) {
      return fail(request, 'invalid', 'positionMs, isPlaying, and expectedVersion are required.');
    }

    try {
      const snapshot = await updateJamState(
        id,
        profile.id,
        body.trackId,
        body.positionMs,
        body.isPlaying,
        body.expectedVersion,
      );
      return ok(request, snapshot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update playback state';
      if (msg.includes('version conflict') || msg.includes('40001')) {
        return fail(
          request,
          'rate_limited',
          'Playback state changed on another device. Retrying sync.',
        );
      }
      if (msg.includes('not authorized') || msg.includes('42501')) {
        return fail(request, 'forbidden', 'Only the host can control playback in this jam.');
      }
      return fail(request, 'invalid', msg);
    }
  },
);
