import { MUSIC_LANGUAGE_PATTERN } from '@geet/shared';
import { fail, ok, clientIp } from '@/lib/http';
import { limited, serverError } from '@/lib/route';
import { preflight } from '@/lib/cors';
import * as repo from '@/lib/repo';

export const dynamic = 'force-dynamic';

/** Onboarding step 3: the top artists by plays, within the languages the person picked (docs/05). */
export async function GET(request: Request) {
  try {
    const tooMany = await limited(request, `ip:${clientIp(request)}:artists`, 30, 60);
    if (tooMany) return tooMany;
    const url = new URL(request.url);
    const languages = (url.searchParams.get('languages') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (languages.length > 12 || languages.some((l) => !MUSIC_LANGUAGE_PATTERN.test(l))) {
      return fail(request, 'invalid', 'Languages must be up to 12 language codes.');
    }
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '24') || 24, 1), 24);
    return ok(request, { items: await repo.topArtists(languages, limit) });
  } catch (err) {
    return serverError(request, err);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
