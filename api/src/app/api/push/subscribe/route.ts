import { ok, fail, preflight } from '@/lib/http';
import { withUser } from '@/lib/route';
import {
  savePushSubscription,
  deletePushSubscription,
  getPushPreferences,
} from '@/lib/social-repo';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const GET = withUser(async (request, { profile }) => {
  const prefs = await getPushPreferences(profile.id);
  return ok(request, { subscribed: Boolean(prefs), prefs });
});

export const POST = withUser(async (request, { profile }) => {
  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    prefs?: Record<string, boolean>;
  } | null;

  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return fail(request, 'invalid', 'Valid push subscription endpoint and keys are required.');
  }

  try {
    await savePushSubscription(
      profile.id,
      body.endpoint,
      { p256dh: body.keys.p256dh, auth: body.keys.auth },
      body.prefs,
    );
    return ok(request, { ok: true, subscribed: true });
  } catch (err) {
    return fail(
      request,
      'invalid',
      err instanceof Error ? err.message : 'Could not save push subscription',
    );
  }
});

export const DELETE = withUser(async (request, { profile }) => {
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return fail(request, 'invalid', 'endpoint is required.');

  try {
    await deletePushSubscription(profile.id, body.endpoint);
    return ok(request, { ok: true, unsubscribed: true });
  } catch (err) {
    return fail(
      request,
      'invalid',
      err instanceof Error ? err.message : 'Could not remove push subscription',
    );
  }
});
