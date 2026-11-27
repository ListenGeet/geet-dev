import { db } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { readUnsubscribeToken } from '@/lib/marketing';
import { preflight } from '@/lib/cors';
import { serverError } from '@/lib/route';

export const dynamic = 'force-dynamic';

async function profileFor(request: Request) {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const profileId = readUnsubscribeToken(token);
  if (!profileId) return null;
  const [{ data: profile, error }, { data: suppression, error: suppressionError }] =
    await Promise.all([
      db().from('profiles').select('email_news').eq('id', profileId).maybeSingle(),
      db().from('email_suppressions').select('reason').eq('profile_id', profileId).maybeSingle(),
    ]);
  if (error || suppressionError)
    throw new Error(`unsubscribe lookup: ${error?.message ?? suppressionError?.message}`);
  if (!profile) return null;
  return { profileId, subscribed: profile.email_news, canUndo: suppression === null };
}

export async function GET(request: Request) {
  try {
    const profile = await profileFor(request);
    if (!profile) return fail(request, 'invalid', 'This unsubscribe link is not valid.');
    return ok(request, { valid: true, subscribed: profile.subscribed, canUndo: profile.canUndo });
  } catch (error) {
    return serverError(request, error);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await profileFor(request);
    if (!profile) return fail(request, 'invalid', 'This unsubscribe link is not valid.');
    let action = 'unsubscribe';
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body = (await request.json().catch(() => ({}))) as { action?: unknown };
      if (body.action === 'undo') action = 'undo';
    }
    if (action === 'undo') {
      if (!profile.canUndo)
        return fail(request, 'forbidden', 'This address cannot receive Geet news.');
      const { error } = await db()
        .from('profiles')
        .update({ email_news: true, email_news_at: new Date().toISOString() })
        .eq('id', profile.profileId);
      if (error) throw new Error(`email preference restore: ${error.message}`);
      return ok(request, { unsubscribed: false });
    }
    const { error } = await db()
      .from('profiles')
      .update({ email_news: false, email_news_at: new Date().toISOString() })
      .eq('id', profile.profileId);
    if (error) throw new Error(`email unsubscribe: ${error.message}`);
    return ok(request, { unsubscribed: true });
  } catch (error) {
    return serverError(request, error);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
