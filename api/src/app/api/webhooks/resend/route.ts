import { Webhook } from 'svix';
import { db } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { serverError } from '@/lib/route';

export const dynamic = 'force-dynamic';
const MAX_PAYLOAD = 256 * 1024;

type ResendEvent = {
  type?: unknown;
  data?: { email_id?: unknown; bounce?: { type?: unknown } };
};

/** Resend feedback only updates delivery records and consent suppression state. */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return serverError(request, new Error('RESEND_WEBHOOK_SECRET is not set'));
  const payload = await request.text();
  if (payload.length > MAX_PAYLOAD)
    return fail(request, 'invalid', 'Webhook payload is too large.');
  const id = request.headers.get('svix-id') ?? '';
  try {
    new Webhook(secret).verify(payload, {
      'svix-id': id,
      'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
      'svix-signature': request.headers.get('svix-signature') ?? '',
    });
  } catch {
    return fail(request, 'unauthorized', 'Signature check failed.');
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(payload) as ResendEvent;
  } catch {
    return fail(request, 'invalid', 'Send valid JSON.');
  }
  const type = typeof event.type === 'string' ? event.type : '';
  const resendId = typeof event.data?.email_id === 'string' ? event.data.email_id : '';
  if (!type || !resendId) return fail(request, 'invalid', 'This is not a Resend email event.');

  try {
    const { data: log, error } = await db()
      .from('email_log')
      .select('id,job_id,profile_id,template')
      .eq('resend_id', resendId)
      .maybeSingle();
    if (error) throw new Error(`Resend event lookup: ${error.message}`);
    if (!log) return ok(request, { handled: false });

    if (type === 'email.delivered') {
      await db().from('email_log').update({ status: 'delivered' }).eq('id', log.id);
    } else if (type === 'email.delivery_delayed') {
      await db().from('email_log').update({ status: 'delivery_delayed' }).eq('id', log.id);
    } else if (type === 'email.failed') {
      await db().from('email_log').update({ status: 'failed' }).eq('id', log.id);
      if (log.job_id)
        await db().from('email_jobs').update({ state: 'failed' }).eq('id', log.job_id);
    } else if (type === 'email.bounced' || type === 'email.complained') {
      const hardBounce = type === 'email.bounced' && event.data?.bounce?.type === 'hard';
      if (type === 'email.complained' || hardBounce) {
        if (log.profile_id) {
          const reason = type === 'email.complained' ? 'complaint' : 'bounce';
          const [{ error: consentError }, { error: suppressionError }] = await Promise.all([
            db().from('profiles').update({ email_news: false }).eq('id', log.profile_id),
            db().from('email_suppressions').upsert({ profile_id: log.profile_id, reason }),
          ]);
          if (consentError || suppressionError)
            throw new Error(
              `Resend suppression: ${consentError?.message ?? suppressionError?.message}`,
            );
        }
      }
      await db()
        .from('email_log')
        .update({ status: type === 'email.bounced' ? 'bounced' : 'complained' })
        .eq('id', log.id);
    }
    return ok(request, { handled: true });
  } catch (error) {
    return serverError(request, error);
  }
}
