import { ok, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { getFriends } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const GET = withUser(async (request, { profile }) => {
  const friends = await getFriends(profile.id);
  const listening = friends.filter((f) => f.listening !== null);
  return ok(request, { items: listening });
});
