import { normalizeUsername, usernameProblem } from '@geet/shared';
import { fail, ok, clientIp } from '@/lib/http';
import { limited, serverError } from '@/lib/route';
import { preflight } from '@/lib/cors';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

/** Public profile card: username, display name, avatar. Never an email, a role or anything else. */
export async function GET(request: Request, route: { params: Promise<{ username: string }> }) {
  try {
    const tooMany = await limited(request, `ip:${clientIp(request)}:profile`, 60, 60);
    if (tooMany) return tooMany;
    const name = normalizeUsername(decodeURIComponent((await route.params).username));
    if (
      usernameProblem(name) === 'too_short' ||
      usernameProblem(name) === 'too_long' ||
      usernameProblem(name) === 'characters'
    ) {
      return fail(request, 'not_found', 'No one has that username.');
    }
    const card = await repo.publicProfile(name);
    if (!card) return fail(request, 'not_found', 'No one has that username.');
    return ok(request, card);
  } catch (err) {
    return serverError(request, err);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
