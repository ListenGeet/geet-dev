import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { removeFriend } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const DELETE = withUser(
  async (request, { profile }, context: { params: Promise<{ profileId: string }> }) => {
    const { profileId } = await context.params;
    try {
      await removeFriend(profile.id, profileId);
      return ok(request, { ok: true });
    } catch (err) {
      return fail(
        request,
        'invalid',
        err instanceof Error ? err.message : 'Could not remove friend',
      );
    }
  },
);
