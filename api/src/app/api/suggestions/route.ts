import { ok, fail, preflight } from '@/lib/http';
import { withUser, limited } from '@/lib/route';
import { getSuggestions, createSuggestions } from '@/lib/social-repo';
import {
  cleanSuggestionNote,
  MAX_SUGGESTION_RECIPIENTS,
  RATE_LIMIT_SUGGESTIONS_DAILY,
} from '@geet/shared';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const GET = withUser(async (request, { profile }) => {
  const items = await getSuggestions(profile.id);
  return ok(request, { items });
});

export const POST = withUser(async (request, { profile }) => {
  const body = (await request.json().catch(() => null)) as {
    toIds?: string[];
    trackId?: string;
    note?: string;
  } | null;

  if (!body?.trackId || !Array.isArray(body.toIds) || body.toIds.length === 0) {
    return fail(request, 'invalid', 'trackId and toIds are required.');
  }

  if (body.toIds.length > MAX_SUGGESTION_RECIPIENTS) {
    return fail(
      request,
      'invalid',
      `Cannot suggest to more than ${MAX_SUGGESTION_RECIPIENTS} friends.`,
    );
  }

  const noteResult = cleanSuggestionNote(body.note);
  if (!noteResult.ok) return fail(request, 'invalid', noteResult.message);

  // Daily rate limit: 20 suggestions per day
  const tooMany = await limited(
    request,
    `suggestions:${profile.id}`,
    RATE_LIMIT_SUGGESTIONS_DAILY,
    86400,
  );
  if (tooMany) return tooMany;

  try {
    const result = await createSuggestions(profile.id, body.toIds, body.trackId, noteResult.note);
    return ok(request, { ok: true, sentCount: result.count });
  } catch (err) {
    return fail(
      request,
      'invalid',
      err instanceof Error ? err.message : 'Could not send suggestions',
    );
  }
});
