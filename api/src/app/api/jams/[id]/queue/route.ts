import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { addJamQueue, getJamSnapshot } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { trackId?: string } | null;

    if (!body?.trackId) return fail(request, 'invalid', 'trackId is required.');

    try {
      await addJamQueue(id, profile.id, body.trackId);
      const snapshot = await getJamSnapshot(id, profile.id);
      return ok(request, snapshot);
    } catch (err) {
      return fail(
        request,
        'invalid',
        err instanceof Error ? err.message : 'Could not add to queue',
      );
    }
  },
);
