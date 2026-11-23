import { db } from '@/lib/db';
import { cronDenied } from '../_auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = cronDenied(request);
  if (denied) return denied;
  const { error } = await db().rpc('cleanup_retained_data');
  if (error) throw new Error(`cleanup: ${error.message}`);
  return Response.json({ cleaned: true }, { headers: { 'Cache-Control': 'no-store' } });
}
