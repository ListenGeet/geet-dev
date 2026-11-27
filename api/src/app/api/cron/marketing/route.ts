import { db } from '@/lib/db';
import { fetchPerson } from '@/lib/clerk';
import { sendTemplate } from '@/lib/email/send';
import { finishEmailJob } from '@/lib/repo';
import { marketingVariables } from '@/lib/marketing';
import { fail, ok } from '@/lib/http';
import { secretMatches } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!secretMatches(request, process.env.CRON_SECRET))
    return fail(request, 'unauthorized', 'Sign in to continue.');
  const cap = Math.max(1, Math.min(50, Number(process.env.MARKETING_DAILY_CAP || 50)));
  const { data: jobs, error } = await db().rpc('claim_marketing_jobs', { p_limit: cap });
  if (error) throw new Error(`marketing queue claim: ${error.message}`);
  let sent = 0;
  let cancelled = 0;
  let failed = 0;
  for (const claimed of (jobs ?? []) as { id: string; profile_id: string; campaign_id: string }[]) {
    const { data: job, error: jobError } = await db()
      .from('email_jobs')
      .select('id,template,data,attempts')
      .eq('id', claimed.id)
      .single();
    const { data: campaign, error: campaignError } = await db()
      .from('email_campaigns')
      .select('subject,preheader,language')
      .eq('id', claimed.campaign_id)
      .single();
    if (jobError || campaignError || !job || !campaign)
      throw new Error(
        `marketing queue lookup: ${jobError?.message ?? campaignError?.message ?? 'missing row'}`,
      );

    const { data: profile, error: profileError } = await db()
      .from('profiles')
      .select('email_news,language')
      .eq('id', claimed.profile_id)
      .maybeSingle();
    if (profileError) throw new Error(`marketing profile: ${profileError.message}`);
    const { data: suppression, error: suppressionError } = await db()
      .from('email_suppressions')
      .select('reason')
      .eq('profile_id', claimed.profile_id)
      .maybeSingle();
    if (suppressionError) throw new Error(`marketing suppression: ${suppressionError.message}`);
    if (!profile?.email_news || profile.language !== campaign.language || suppression) {
      await finishEmailJob(job.id, 'cancelled', job.attempts, {
        template: job.template,
        profileId: claimed.profile_id,
        resendId: null,
        status: 'skipped_consent_or_suppression',
      });
      cancelled++;
      continue;
    }

    const weekStart = new Date(Date.now() - 7 * 86400000).toISOString();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [week, month] = await Promise.all([
      db()
        .from('email_log')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', claimed.profile_id)
        .eq('status', 'sent')
        .like('template', 'marketing-%')
        .gte('created_at', weekStart),
      db()
        .from('email_log')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', claimed.profile_id)
        .eq('status', 'sent')
        .like('template', 'marketing-%')
        .gte('created_at', monthStart.toISOString()),
    ]);
    if (week.error || month.error)
      throw new Error(`marketing frequency check: ${week.error?.message ?? month.error?.message}`);
    if ((week.count ?? 0) >= 1 || (month.count ?? 0) >= 2) {
      await finishEmailJob(job.id, 'cancelled', job.attempts, {
        template: job.template,
        profileId: claimed.profile_id,
        resendId: null,
        status: 'skipped_frequency_limit',
      });
      cancelled++;
      continue;
    }

    let email: string | null = null;
    try {
      const { data: identity, error: identityError } = await db()
        .from('identities')
        .select('subject')
        .eq('profile_id', claimed.profile_id)
        .eq('provider', 'clerk')
        .maybeSingle();
      if (identityError) throw new Error(`marketing identity: ${identityError.message}`);
      if (!identity?.subject) throw new Error('marketing identity is unavailable');
      const person = await fetchPerson(identity.subject);
      if (person.email && person.emailVerified) email = person.email;
    } catch (identityError) {
      await finishEmailJob(job.id, 'failed', job.attempts + 1, {
        template: job.template,
        profileId: claimed.profile_id,
        resendId: null,
        status: 'failed',
      });
      failed++;
      console.error(
        '[marketing] identity lookup failed:',
        identityError instanceof Error ? identityError.message : 'unknown',
      );
      continue;
    }
    if (!email) {
      await finishEmailJob(job.id, 'cancelled', job.attempts, {
        template: job.template,
        profileId: claimed.profile_id,
        resendId: null,
        status: 'skipped_unverified_email',
      });
      cancelled++;
      continue;
    }
    if (job.template !== 'marketing-announcement' && job.template !== 'marketing-weekly')
      throw new Error('Unknown marketing template');
    const content = (job.data ?? {}) as Record<string, unknown>;
    const vars = marketingVariables(
      job.template,
      content,
      campaign.subject,
      campaign.preheader ?? '',
      claimed.profile_id,
      process.env.MARKETING_POSTAL_ADDRESS ?? '',
    );
    try {
      const outcome = await sendTemplate(
        {
          kind: 'marketing',
          to: email,
          profileId: claimed.profile_id,
          idempotencyKey: `${claimed.campaign_id}:${claimed.profile_id}`,
          priority: 10,
          campaignId: claimed.campaign_id,
          headers: {
            'List-Unsubscribe': `<${vars.unsubscribe_url}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        },
        job.template,
        vars,
      );
      if (outcome === 'sent') sent++;
      else cancelled++;
    } catch (sendError) {
      failed++;
      console.error(
        '[marketing] send failed:',
        sendError instanceof Error ? sendError.message : 'unknown',
      );
    }
  }

  const campaignIds = [
    ...new Set(((jobs ?? []) as { campaign_id: string }[]).map((job) => job.campaign_id)),
  ];
  for (const campaignId of campaignIds) {
    const { count: remaining, error: remainingError } = await db()
      .from('email_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .in('state', ['queued', 'sending', 'failed']);
    if (remainingError) throw new Error(`marketing campaign status: ${remainingError.message}`);
    if (!remaining)
      await db().from('email_campaigns').update({ status: 'sent' }).eq('id', campaignId);
    else await db().from('email_campaigns').update({ status: 'sending' }).eq('id', campaignId);
  }
  return ok(request, { processed: (jobs ?? []).length, sent, cancelled, failed });
}
