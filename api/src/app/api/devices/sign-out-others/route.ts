import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { signOutOtherDevices } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = withUser(async (request, { profile, sub, sid }) => {
  if (!sid) {
    return fail(request, 'invalid', 'No active session id found.');
  }

  const result = await signOutOtherDevices(profile.id, sub, sid);
  return ok(request, { ok: true, revokedCount: result.revokedCount });
});
