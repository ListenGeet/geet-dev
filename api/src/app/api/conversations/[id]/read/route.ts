import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { markConversationRead } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { lastReadMessageId?: string };

    try {
      await markConversationRead(id, profile.id, body.lastReadMessageId);
      return ok(request, { ok: true });
    } catch (err) {
      return fail(
        request,
        'invalid',
        err instanceof Error ? err.message : 'Could not mark conversation read',
      );
    }
  },
);
