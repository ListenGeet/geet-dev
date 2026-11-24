import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { respondFriendRequest } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const PATCH = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      action?: 'accept' | 'decline' | 'cancel';
    } | null;

    if (!body?.action || !['accept', 'decline', 'cancel'].includes(body.action)) {
      return fail(request, 'invalid', 'Action must be accept, decline, or cancel.');
    }

    try {
      await respondFriendRequest(id, profile.id, body.action);
      return ok(request, { ok: true, action: body.action });
    } catch (err) {
      return fail(
        request,
        'invalid',
        err instanceof Error ? err.message : 'Could not process request',
      );
    }
  },
);
