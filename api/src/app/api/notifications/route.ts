import { ok, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { getNotifications, markNotificationsRead } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const GET = withUser(async (request, { profile }) => {
  const items = await getNotifications(profile.id);
  const unreadCount = items.filter((n) => !n.readAt).length;
  return ok(request, { items, unreadCount });
});

export const POST = withUser(async (request, { profile }) => {
  await markNotificationsRead(profile.id);
  return ok(request, { ok: true, markedRead: true });
});
