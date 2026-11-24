import { ok, preflight } from '@/lib/http';
import { withUser, limited } from '@/lib/route';
import { updatePresence } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = withUser(async (request, { profile }) => {
  // Throttled to once per 20 seconds (doc 15)
  const tooMany = await limited(request, `presence:${profile.id}`, 1, 20);
  if (tooMany) return ok(request, { ok: true, throttled: true });

  const body = (await request.json().catch(() => ({}))) as { trackId?: string | null };
  const trackId = typeof body.trackId === 'string' && body.trackId ? body.trackId : null;

  await updatePresence(profile.id, trackId);
  return ok(request, { ok: true });
});
