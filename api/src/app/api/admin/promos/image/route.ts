import { preflight } from '@/lib/cors';
import { fail, ok, readJson } from '@/lib/http';
import { storage } from '@/lib/storage';
import { withUser } from '@/lib/route';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const contentTypes: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const POST = withUser(
  async (request) => {
    const parsed = await readJson(request);
    if ('response' in parsed) return parsed.response;
    const body = parsed.body as { id?: unknown; contentType?: unknown; size?: unknown };
    if (typeof body.id !== 'string' || !uuid.test(body.id))
      return fail(request, 'invalid', 'Choose a valid promo image.');
    if (typeof body.contentType !== 'string' || !contentTypes[body.contentType])
      return fail(request, 'invalid', 'Use a JPG, PNG or WebP image.');
    if (typeof body.size !== 'number' || body.size < 1 || body.size > 2 * 1024 * 1024)
      return fail(request, 'invalid', 'Promo images must be 2 MB or smaller.');
    const imagePath = `promos/${body.id}.${contentTypes[body.contentType]}`;
    const grant = await storage().signUpload(imagePath, body.contentType, 900);
    return ok(request, { imagePath, ...grant });
  },
  { admin: true },
);

export function OPTIONS(request: Request) {
  return preflight(request);
}
