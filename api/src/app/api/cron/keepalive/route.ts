import { db } from '@/lib/db';
import { cronDenied } from '../_auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = cronDenied(request);
  if (denied) return denied;
  const { error } = await db().from('profiles').select('id').limit(1);
  if (error) throw new Error(`keepalive: ${error.message}`);
  return Response.json({ alive: true }, { headers: { 'Cache-Control': 'no-store' } });
}
