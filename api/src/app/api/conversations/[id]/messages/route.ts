import { ok, fail, preflight } from '@/lib/http';
import { withUser, limited } from '@/lib/route';
import { getMessages, sendMessage } from '@/lib/social-repo';
import { cleanMessageBody, RATE_LIMIT_MESSAGES_PER_MINUTE } from '@geet/shared';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const GET = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '40', 10);

    try {
      const data = await getMessages(id, profile.id, cursor, Math.min(limit, 100));
      return ok(request, data);
    } catch (err) {
      return fail(
        request,
        'invalid',
        err instanceof Error ? err.message : 'Could not load messages',
      );
    }
  },
);

export const POST = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    // Rate limit: 30 messages per minute per user (doc 07)
    const tooMany = await limited(request, `msg:${profile.id}`, RATE_LIMIT_MESSAGES_PER_MINUTE, 60);
    if (tooMany) return tooMany;

    const body = (await request.json().catch(() => null)) as {
      kind?: 'text' | 'track' | 'jam';
      body?: string;
      trackId?: string;
      jamId?: string;
    } | null;

    const kind = body?.kind || 'text';
    if (!['text', 'track', 'jam'].includes(kind)) {
      return fail(request, 'invalid', 'kind must be text, track, or jam.');
    }

    let cleanedBody: string | undefined = undefined;
    if (kind === 'text') {
      const result = cleanMessageBody(body?.body || '');
      if (!result.ok) return fail(request, 'invalid', result.message);
      cleanedBody = result.body;
    } else if (body?.body) {
      const result = cleanMessageBody(body.body);
      if (result.ok) cleanedBody = result.body;
    }

    if (kind === 'track' && !body?.trackId) {
      return fail(request, 'invalid', 'trackId is required for track card messages.');
    }
    if (kind === 'jam' && !body?.jamId) {
      return fail(request, 'invalid', 'jamId is required for jam invite messages.');
    }

    try {
      const message = await sendMessage(
        id,
        profile.id,
        kind,
        cleanedBody,
        body?.trackId,
        body?.jamId,
      );
      return ok(request, message);
    } catch (err) {
      return fail(
        request,
        'invalid',
        err instanceof Error ? err.message : 'Could not send message',
      );
    }
  },
);
