import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { reorderJamQueue, getJamSnapshot } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const PUT = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { itemIds?: string[] } | null;

    if (!Array.isArray(body?.itemIds)) {
      return fail(request, 'invalid', 'itemIds array is required.');
    }

    try {
      await reorderJamQueue(id, profile.id, body!.itemIds!);
      const snapshot = await getJamSnapshot(id, profile.id);
      return ok(request, snapshot);
    } catch (err) {
      return fail(
        request,
        'invalid',
        err instanceof Error ? err.message : 'Could not reorder queue',
      );
    }
  },
);
