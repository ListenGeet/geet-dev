import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import { getJamSnapshot, changeJamControls } from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const GET = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    try {
      const snapshot = await getJamSnapshot(id, profile.id);
      if (!snapshot) return fail(request, 'not_found', 'Jam not found.');
      return ok(request, snapshot);
    } catch (err) {
      return fail(request, 'invalid', err instanceof Error ? err.message : 'Could not load jam');
    }
  },
);

export const PATCH = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      controls?: 'host' | 'everyone';
    } | null;

    if (!body?.controls || !['host', 'everyone'].includes(body.controls)) {
      return fail(request, 'invalid', 'controls must be host or everyone.');
    }

    try {
      await changeJamControls(id, profile.id, body.controls);
      const snapshot = await getJamSnapshot(id, profile.id);
      return ok(request, snapshot);
    } catch (err) {
      return fail(
        request,
        'forbidden',
        err instanceof Error ? err.message : 'Could not update controls',
      );
    }
  },
);
