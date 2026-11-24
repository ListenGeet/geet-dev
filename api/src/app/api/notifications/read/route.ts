import { ok, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { markNotificationsRead } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = withUser(async (request, { profile }) => {
  await markNotificationsRead(profile.id);
  return ok(request, { ok: true });
});
