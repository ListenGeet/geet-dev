import { ok, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { getSignInDevices } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const GET = withUser(async (request, { profile, sid }) => {
  const items = await getSignInDevices(profile.id, sid);
  return ok(request, { items });
});
