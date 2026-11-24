import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { createJam, getJamSnapshot } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = withUser(async (request, { profile }) => {
  const body = (await request.json().catch(() => ({}))) as { trackId?: string };

  try {
    const jam = await createJam(profile.id, body.trackId);
    const snapshot = await getJamSnapshot(jam.id, profile.id);
    return ok(request, snapshot ?? jam);
  } catch (err) {
    return fail(request, 'invalid', err instanceof Error ? err.message : 'Could not create jam');
  }
});
