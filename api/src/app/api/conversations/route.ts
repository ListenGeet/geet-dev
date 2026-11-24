import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { getConversations, getOrCreateConversation } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const GET = withUser(async (request, { profile }) => {
  const items = await getConversations(profile.id);
  return ok(request, { items });
});

export const POST = withUser(async (request, { profile }) => {
  const body = (await request.json().catch(() => null)) as { withId?: string } | null;
  const withId = body?.withId?.trim();

  if (!withId) return fail(request, 'invalid', 'withId is required.');
  if (withId === profile.id)
    return fail(request, 'invalid', 'Cannot start conversation with yourself.');

  try {
    const conv = await getOrCreateConversation(profile.id, withId);
    return ok(request, conv);
  } catch (err) {
    return fail(
      request,
      'invalid',
      err instanceof Error ? err.message : 'Could not create conversation',
    );
  }
});
