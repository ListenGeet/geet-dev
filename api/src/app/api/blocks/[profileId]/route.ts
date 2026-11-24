import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { blockUser, unblockUser } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = withUser(
  async (request, { profile }, context: { params: Promise<{ profileId: string }> }) => {
    const { profileId } = await context.params;
    try {
      await blockUser(profile.id, profileId);
      return ok(request, { ok: true, blocked: true });
    } catch (err) {
      return fail(request, 'invalid', err instanceof Error ? err.message : 'Could not block user');
    }
  },
);

export const DELETE = withUser(
  async (request, { profile }, context: { params: Promise<{ profileId: string }> }) => {
    const { profileId } = await context.params;
    try {
      await unblockUser(profile.id, profileId);
      return ok(request, { ok: true, unblocked: true });
    } catch (err) {
      return fail(
        request,
        'invalid',
        err instanceof Error ? err.message : 'Could not unblock user',
      );
    }
  },
);
