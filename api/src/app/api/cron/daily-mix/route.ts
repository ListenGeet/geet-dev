import { db } from '@/lib/db';
import { cronDenied } from '../_auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = cronDenied(request);
  if (denied) return denied;
  const client = db();
  const { data: eligible, error: eligibleError } = await client.rpc('daily_mix_candidates');
  if (eligibleError) throw new Error(`daily mix candidates: ${eligibleError.message}`);
  let generated = 0;
  for (const row of (eligible ?? []) as { profile_id: string }[]) {
    const { error: generationError } = await client.rpc('generate_daily_mix', {
      p_profile: row.profile_id,
    });
    if (generationError) throw new Error(`daily mix generate: ${generationError.message}`);
    generated++;
  }
  return Response.json({ generated }, { headers: { 'Cache-Control': 'no-store' } });
}
