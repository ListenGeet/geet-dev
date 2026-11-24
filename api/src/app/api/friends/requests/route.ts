import { ok, fail, preflight } from '@/lib/http';
import { withUser, limited } from '@/lib/route';
import { sendFriendRequest } from '@/lib/social-repo';
import { RATE_LIMIT_FRIEND_REQUESTS_DAILY } from '@geet/shared';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = withUser(async (request, { profile }) => {
  const body = (await request.json().catch(() => null)) as { username?: string } | null;
  const username = body?.username?.trim();

  if (!username) {
    return fail(request, 'invalid', 'Username is required.');
  }

  // Rate limit: 20 per day (86400s)
  const tooMany = await limited(
    request,
    `friend-req:${profile.id}`,
    RATE_LIMIT_FRIEND_REQUESTS_DAILY,
    86400,
  );
  if (tooMany) return tooMany;

  try {
    const result = await sendFriendRequest(profile.id, username);
    return ok(request, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not send friend request';
    return fail(request, 'invalid', msg);
  }
});
