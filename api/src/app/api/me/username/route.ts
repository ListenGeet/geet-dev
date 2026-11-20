import { fail, ok, readJson } from '@/lib/http';
import { setUsername } from '@/lib/me';
import { preflight } from '@/lib/cors';
import { withUser } from '@/lib/route';

export const dynamic = 'force-dynamic';

/** Sets or changes the username: format, uniqueness, and one change per 30 days. */
export const PUT = withUser(
  async (request, { profile }) => {
    const read = await readJson(request);
    if ('response' in read) return read.response;
    const username = (read.body as { username?: unknown }).username;
    if (typeof username !== 'string') return fail(request, 'invalid', 'Send a username.');
    const result = await setUsername(profile, username);
    if (!result.ok) return fail(request, 'invalid', result.message);
    return ok(request, { username: result.username });
  },
  { limit: 20 },
);

export function OPTIONS(request: Request) {
  return preflight(request);
}
