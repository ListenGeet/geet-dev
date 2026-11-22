import { browseValues } from '@/lib/catalogue';
import { ok, clientIp } from '@/lib/http';
import { limited, serverError } from '@/lib/route';
import { preflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const blocked = await limited(request, `ip:${clientIp(request)}:browse`, 60, 60);
    if (blocked) return blocked;
    return ok(request, { items: await browseValues('genre') });
  } catch (error) {
    return serverError(request, error);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
