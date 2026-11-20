import { ok } from '@/lib/http';
import { checkAvailability } from '@/lib/me';
import { preflight } from '@/lib/cors';
import { withUser } from '@/lib/route';

export const dynamic = 'force-dynamic';

/** Live check while typing on the onboarding screen. Rate limited more tightly than other reads. */
export const GET = withUser(
  async (request, { profile }, route: { params: Promise<{ name: string }> }) => {
    const { name } = await route.params;
    return ok(request, await checkAvailability(profile, decodeURIComponent(name)));
  },
  { limit: 60 },
);

export function OPTIONS(request: Request) {
  return preflight(request);
}
