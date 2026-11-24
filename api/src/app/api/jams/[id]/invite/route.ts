import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { inviteJamFriends } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { toIds?: string[] } | null;

    if (!Array.isArray(body?.toIds) || body.toIds.length === 0) {
      return fail(request, 'invalid', 'toIds is required.');
    }

    try {
      await inviteJamFriends(id, profile.id, body!.toIds!);
      return ok(request, { ok: true, invited: body!.toIds!.length });
    } catch (err) {
      return fail(
        request,
        'invalid',
        err instanceof Error ? err.message : 'Could not invite friends',
      );
    }
  },
);
