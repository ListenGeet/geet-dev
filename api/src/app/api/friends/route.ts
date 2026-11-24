import { ok, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { getFriends, getFriendRequests } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const GET = withUser(async (request, { profile }) => {
  const [friends, requests] = await Promise.all([
    getFriends(profile.id),
    getFriendRequests(profile.id),
  ]);

  return ok(request, {
    friends,
    requests: requests.incoming,
    outgoing: requests.outgoing,
  });
});
