import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { deleteMessageForEveryone } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const DELETE = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    try {
      await deleteMessageForEveryone(id, profile.id);
      return ok(request, { ok: true, deleted: true });
    } catch (err) {
      return fail(
        request,
        'invalid',
        err instanceof Error ? err.message : 'Could not delete message',
      );
    }
  },
);
