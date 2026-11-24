import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { removeJamQueueItem, getJamSnapshot } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const DELETE = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string; itemId: string }> }) => {
    const { id, itemId } = await context.params;

    try {
      await removeJamQueueItem(id, profile.id, itemId);
      const snapshot = await getJamSnapshot(id, profile.id);
      return ok(request, snapshot);
    } catch (err) {
      return fail(request, 'invalid', err instanceof Error ? err.message : 'Could not remove item');
    }
  },
);
