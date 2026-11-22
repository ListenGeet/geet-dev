import { db } from '@/lib/db';
import { readJson, fail, ok, clientIp } from '@/lib/http';
import { limited, serverError } from '@/lib/route';
import { preflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reasons = ['Copyright', 'Wrong or misleading info', 'Offensive or hateful', 'Spam', 'Other'];

export async function POST(request: Request) {
  try {
    const blocked = await limited(request, `ip:${clientIp(request)}:reports`, 5, 3600);
    if (blocked) return blocked;
    const parsed = await readJson(request);
    if ('response' in parsed) return parsed.response;
    const body = parsed.body as {
      trackId?: unknown;
      kind?: unknown;
      reason?: unknown;
      note?: unknown;
      email?: unknown;
      claimant?: unknown;
    };
    if (body.kind !== 'song' && body.kind !== 'copyright')
      return fail(request, 'invalid', 'Choose a report type.');
    if (typeof body.reason !== 'string' || !reasons.includes(body.reason))
      return fail(request, 'invalid', 'Choose a reason from the list.');
    if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500))
      return fail(request, 'invalid', 'Add up to 500 characters.');
    if (
      body.trackId !== undefined &&
      body.trackId !== null &&
      (typeof body.trackId !== 'string' || !uuid.test(body.trackId))
    )
      return fail(request, 'invalid', 'That song could not be found.');
    if (
      body.kind === 'copyright' &&
      (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))
    )
      return fail(request, 'invalid', 'Add a contact email for a copyright report.');
    let claimant: { email: string; work: string; location: string; statement: boolean } | null =
      null;
    if (body.kind === 'copyright') {
      const details = body.claimant as {
        work?: unknown;
        location?: unknown;
        statement?: unknown;
      } | null;
      if (typeof details?.work !== 'string' || !details.work.trim() || details.work.length > 200)
        return fail(request, 'invalid', 'Name the copyrighted work.');
      if (typeof details.location !== 'string' || details.location.length > 500)
        return fail(request, 'invalid', 'Add where the work appears on Geet.');
      if (details.statement !== true)
        return fail(request, 'invalid', 'Confirm the good-faith copyright statement.');
      claimant = {
        email: (body.email as string).trim().slice(0, 254),
        work: details.work.trim(),
        location: details.location.trim(),
        statement: true,
      };
    }
    const { error } = await db()
      .from('reports')
      .insert({
        track_id: body.trackId ?? null,
        kind: body.kind,
        reason: body.reason,
        note: typeof body.note === 'string' ? body.note.trim() : null,
        reporter_email: claimant?.email ?? null,
        claimant,
      });
    if (error) throw new Error(`report create: ${error.message}`);
    return ok(request, { submitted: true }, 201);
  } catch (error) {
    return serverError(request, error);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
