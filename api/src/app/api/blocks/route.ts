import { ok, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { getBlockedUsers } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const GET = withUser(async (request, { profile }) => {
  const items = await getBlockedUsers(profile.id);
  return ok(request, { items });
});
