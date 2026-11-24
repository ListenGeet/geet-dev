import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { leaveJam } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    try {
      await leaveJam(id, profile.id);
      return ok(request, { ok: true, left: true });
    } catch (err) {
      return fail(request, 'invalid', err instanceof Error ? err.message : 'Could not leave jam');
    }
  },
);
