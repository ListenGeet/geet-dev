import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { endJam } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    try {
      await endJam(id, profile.id);
      return ok(request, { ok: true, ended: true });
    } catch (err) {
      return fail(request, 'forbidden', err instanceof Error ? err.message : 'Could not end jam');
    }
  },
);
