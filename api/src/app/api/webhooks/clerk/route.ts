import { Webhook } from 'svix';
import { fail, ok } from '@/lib/http';
import { serverError } from '@/lib/route';
import { handleClerkEvent, type ClerkEvent } from '@/lib/webhooks/clerk';

export const dynamic = 'force-dynamic';

const MAX_PAYLOAD = 256 * 1024;

/**
 * Clerk webhooks (docs/20 §3). The signature is checked first, on the raw body, before anything is parsed
 * or done. The Svix message id is the idempotency key, because Clerk repeats events.
 */
export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return serverError(request, new Error('CLERK_WEBHOOK_SECRET is not set'));

  const payload = await request.text();
  if (payload.length > MAX_PAYLOAD) return fail(request, 'unauthorized', 'Signature check failed.');

  const id = request.headers.get('svix-id') ?? '';
  const headers = {
    'svix-id': id,
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  };

  try {
    new Webhook(secret).verify(payload, headers); // throws on a bad signature or a stale timestamp
  } catch {
    return fail(request, 'unauthorized', 'Signature check failed.');
  }

  let event: ClerkEvent;
  try {
    event = JSON.parse(payload) as ClerkEvent;
  } catch {
    return fail(request, 'invalid', 'Send valid JSON.');
  }
  if (typeof event?.type !== 'string' || typeof event.data !== 'object' || event.data === null) {
    return fail(request, 'invalid', 'Not a Clerk event.');
  }

  try {
    const handled = await handleClerkEvent(event, id);
    return ok(request, { ok: true, handled });
  } catch (err) {
    // 500 makes Svix retry; every handler is idempotent.
    return serverError(request, err);
  }
}
