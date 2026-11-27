import { confirmPlaylistProposal } from '@/lib/ai';
import { fail, ok, readJson } from '@/lib/http';
import { preflight } from '@/lib/cors';
import { serverError, withUser } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const POST = withUser(async (request, { profile }) => {
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const body = parsed.body as {
    action?: unknown;
    name?: unknown;
    playlistId?: unknown;
    trackIds?: unknown;
  };
  if (body.action !== 'create' && body.action !== 'add')
    return fail(request, 'invalid', 'Choose a playlist action.');
  try {
    const result = await confirmPlaylistProposal(profile.id, {
      action: body.action,
      name: body.name,
      playlistId: body.playlistId,
      trackIds: body.trackIds,
    });
    return ok(request, result, 201);
  } catch (error) {
    if (error instanceof Error && /Choose|Name|playlist|song limit/i.test(error.message))
      return fail(request, 'invalid', error.message);
    return serverError(request, error);
  }
});

export function OPTIONS(request: Request) {
  return preflight(request);
}
