import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { joinJam } from '@/lib/social-repo';
import { isValidJamCode } from '@geet/shared';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = withUser(async (request, { profile }) => {
  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  const code = body?.code?.trim();

  if (!code || !isValidJamCode(code)) {
    return fail(request, 'invalid', 'A 6-character code is required.');
  }

  try {
    const snapshot = await joinJam(code, profile.id);
    return ok(request, snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not join jam';
    if (msg.includes('jam is full')) {
      return fail(request, 'capped', 'This jam has reached the 8-member limit.');
    }
    if (msg.includes('jam ended')) {
      return fail(request, 'gone', 'This jam has ended.');
    }
    return fail(request, 'not_found', 'We could not find that jam code.');
  }
});
