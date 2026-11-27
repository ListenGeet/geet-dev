import { coverKey, incomingKey, trackFileKey } from '@geet/shared';
import { db } from '@/lib/db';
import { fail, ok, readJson } from '@/lib/http';
import { removeTrack } from '@/lib/repo';
import { storage } from '@/lib/storage';
import { dispatchTranscode } from '@/lib/uploads';
import { fetchPerson } from '@/lib/clerk';
import { sendTemplate } from '@/lib/email/send';
import { marketingVariables } from '@/lib/marketing';
import { randomUUID } from 'node:crypto';
import { preflight } from '@/lib/cors';
import { withUser } from '@/lib/route';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ section: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sections = new Set(['overview', 'reports', 'tracks', 'promos', 'emails', 'usage']);

async function audit(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  detail?: unknown,
) {
  const { error } = await db()
    .from('admin_log')
    .insert({
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
      detail: detail ?? null,
    });
  if (error) throw new Error(`admin audit: ${error.message}`);
}

async function count(table: string, column = 'id') {
  const result = await db().from(table).select(column, { count: 'exact', head: true });
  if (result.error) throw new Error(`admin ${table}: ${result.error.message}`);
  return result.count ?? 0;
}

async function countEquals(table: string, field: string, value: string | boolean) {
  const result = await db()
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(field, value);
  if (result.error) throw new Error(`admin ${table}: ${result.error.message}`);
  return result.count ?? 0;
}

async function overview() {
  const sevenDays = new Date(Date.now() - 7 * 86400000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const [ready, pending, failed, reports, activeUsers, files, egress, ai] = await Promise.all([
    countEquals('tracks', 'status', 'ready'),
    db()
      .from('upload_jobs')
      .select('id', { count: 'exact', head: true })
      .in('state', ['queued', 'running', 'awaiting_upload'])
      .then((r) => {
        if (r.error) throw new Error(`admin upload_jobs: ${r.error.message}`);
        return r.count ?? 0;
      }),
    countEquals('upload_jobs', 'state', 'failed'),
    countEquals('reports', 'status', 'open'),
    db().from('play_history').select('profile_id').gte('played_at', sevenDays).limit(5000),
    db().from('track_files').select('size_bytes'),
    db()
      .from('egress_daily')
      .select('bytes')
      .gte('day', today.slice(0, 8) + '01'),
    db().from('usage_daily').select('ai_count').eq('day', today),
  ]);
  for (const result of [activeUsers, files, egress, ai])
    if (result.error) throw new Error(`admin overview: ${result.error.message}`);
  const uniqueUsers = new Set((activeUsers.data ?? []).map((row) => row.profile_id)).size;
  const storageBytes = (files.data ?? []).reduce(
    (sum, row) => sum + Number(row.size_bytes ?? 0),
    0,
  );
  const egressBytes = (egress.data ?? []).reduce((sum, row) => sum + Number(row.bytes ?? 0), 0);
  const aiCount = (ai.data ?? []).reduce((sum, row) => sum + Number(row.ai_count ?? 0), 0);
  const storageCap = process.env.STORAGE_PROVIDER === 'b2' ? 10 * 1024 ** 3 : 1024 ** 3;
  const egressCap =
    Number(process.env.EGRESS_CAP_GB ?? (process.env.STORAGE_PROVIDER === 'b2' ? 30 : 5)) *
    1024 ** 3;
  const { data: attention, error: attentionError } = await db()
    .from('reports')
    .select('id,track_id,reason,created_at')
    .eq('status', 'open')
    .lte('created_at', new Date(Date.now() - 48 * 3600000).toISOString())
    .order('created_at')
    .limit(20);
  if (attentionError) throw new Error(`admin attention: ${attentionError.message}`);
  const { data: log, error: logError } = await db()
    .from('admin_log')
    .select('id,action,target_type,target_id,detail,created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (logError) throw new Error(`admin audit log: ${logError.message}`);
  return {
    songsReady: ready,
    processing: pending,
    failed,
    openReports: reports,
    activeUsers7d: uniqueUsers,
    storage: { used: storageBytes, cap: storageCap },
    egress: { used: egressBytes, cap: egressCap, estimated: true },
    assistant: { today: aiCount, limitPerUser: Number(process.env.AI_DAILY_LIMIT || 30) },
    provider: process.env.STORAGE_PROVIDER || 'supabase',
    bucket: process.env.STORAGE_BUCKET || process.env.B2_BUCKET || 'audio',
    needsAttention: attention ?? [],
    audit: log ?? [],
  };
}

function validPromo(body: Record<string, unknown>) {
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 60)
    return 'Add a title up to 60 characters.';
  if (body.kicker !== undefined && (typeof body.kicker !== 'string' || body.kicker.length > 24))
    return 'Keep the caption within 24 characters.';
  if (
    body.buttonLabel !== undefined &&
    body.buttonLabel !== null &&
    (typeof body.buttonLabel !== 'string' || body.buttonLabel.length > 16)
  )
    return 'Keep the button label within 16 characters.';
  if (
    typeof body.link !== 'string' ||
    !(/^\/(?!\/)[^\\\s]*$/.test(body.link) || /^https:\/\/[^\s]+$/i.test(body.link))
  )
    return 'Use an internal path or an HTTPS link.';
  if (body.active !== undefined && typeof body.active !== 'boolean')
    return 'Choose whether the promo is active.';
  for (const key of ['startsAt', 'endsAt'])
    if (
      body[key] !== null &&
      body[key] !== undefined &&
      (typeof body[key] !== 'string' || Number.isNaN(Date.parse(body[key] as string)))
    )
      return 'Choose valid start and end dates.';
  if (
    typeof body.startsAt === 'string' &&
    typeof body.endsAt === 'string' &&
    Date.parse(body.endsAt) <= Date.parse(body.startsAt)
  )
    return 'The end date must be after the start date.';
  return null;
}

async function removeObjects(trackId: string, adminId: string) {
  const { data: track, error: trackError } = await db()
    .from('tracks')
    .select('uploader_id')
    .eq('id', trackId)
    .maybeSingle();
  if (trackError) throw new Error(`admin track owner: ${trackError.message}`);
  const { data: files, error } = await db()
    .from('track_files')
    .select('path')
    .eq('track_id', trackId);
  if (error) throw new Error(`admin track files: ${error.message}`);
  const paths = [
    trackFileKey(trackId, 'full'),
    trackFileKey(trackId, 'preview'),
    coverKey(trackId),
    ...(track?.uploader_id ? [incomingKey(track.uploader_id, trackId)] : []),
    ...(files ?? []).map((file) => file.path),
  ];
  const storedPaths = await removeTrack(trackId, adminId);
  await storage().remove([...new Set([...paths, ...storedPaths])]);
}

export const GET = withUser(
  async (request, _ctx, { params }: Params) => {
    const { section } = await params;
    if (!sections.has(section)) return fail(request, 'not_found', 'Admin page not found.');
    if (section === 'overview') return ok(request, await overview());
    if (section === 'reports') {
      const url = new URL(request.url);
      let query = db()
        .from('reports')
        .select(
          'id,track_id,reporter_id,reporter_email,kind,reason,note,claimant,status,handled_by,handled_at,created_at,tracks(id,title,artist,language,duration_ms,status,uploader_id)',
        )
        .order('created_at', { ascending: false })
        .limit(100);
      const status = url.searchParams.get('status');
      const kind = url.searchParams.get('kind');
      if (status && ['open', 'dismissed', 'removed'].includes(status))
        query = query.eq('status', status);
      if (kind && ['song', 'copyright'].includes(kind)) query = query.eq('kind', kind);
      const { data, error } = await query;
      if (error) throw new Error(`admin reports: ${error.message}`);
      return ok(request, { items: data ?? [] });
    }
    if (section === 'tracks') {
      const { data, error } = await db()
        .from('tracks')
        .select(
          'id,title,artist,album,language,genre,status,plays,duration_ms,uploader_id,created_at,error,track_files(kind,size_bytes)',
        )
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(`admin tracks: ${error.message}`);
      return ok(request, { items: data ?? [] });
    }
    if (section === 'promos') {
      const { data, error } = await db()
        .from('promos')
        .select(
          'id,kicker,title,button_label,image_path,link,starts_at,ends_at,active,sort,created_at',
        )
        .order('sort')
        .limit(100);
      if (error) throw new Error(`admin promos: ${error.message}`);
      const items = await Promise.all(
        (data ?? []).map(async (promo) => ({
          ...promo,
          imageUrl: promo.image_path
            ? await storage()
                .signDownload(promo.image_path, 3600)
                .catch(() => null)
            : null,
        })),
      );
      return ok(request, { items });
    }
    if (section === 'usage') {
      const [
        { data: usage, error: usageError },
        { data: egress, error: egressError },
        { data: top, error: topError },
      ] = await Promise.all([
        db()
          .from('usage_daily')
          .select('day,plays,uploads,ai_count')
          .order('day', { ascending: false })
          .limit(30),
        db()
          .from('egress_daily')
          .select('day,provider,bytes')
          .order('day', { ascending: false })
          .limit(30),
        db()
          .from('tracks')
          .select('id,title,artist,plays')
          .eq('status', 'ready')
          .order('plays', { ascending: false })
          .limit(10),
      ]);
      if (usageError || egressError || topError)
        throw new Error(
          `admin usage: ${usageError?.message ?? egressError?.message ?? topError?.message}`,
        );
      return ok(request, { usage: usage ?? [], egress: egress ?? [], topTracks: top ?? [] });
    }
    const [{ data: campaigns, error: campaignError }, subscribers, suppressed] = await Promise.all([
      db()
        .from('email_campaigns')
        .select('id,template,language,subject,preheader,scheduled_for,status,created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      countEquals('profiles', 'email_news', true),
      count('email_suppressions'),
    ]);
    if (campaignError) throw new Error(`admin emails: ${campaignError.message}`);
    const today = new Date().toISOString().slice(0, 10);
    const { count: sentToday, error: sentError } = await db()
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00.000Z`)
      .eq('status', 'sent');
    if (sentError) throw new Error(`admin email budget: ${sentError.message}`);
    return ok(request, {
      campaigns: campaigns ?? [],
      subscribers,
      suppressed,
      sentToday: sentToday ?? 0,
      dailyCap: Number(process.env.MARKETING_DAILY_CAP || 50),
      totalDailyCap: 100,
      postalReady: Boolean(process.env.MARKETING_POSTAL_ADDRESS?.trim()),
    });
  },
  { admin: true },
);

export const POST = withUser(
  async (request, { profile, sub }, { params }: Params) => {
    const { section } = await params;
    const parsed = await readJson(request);
    if ('response' in parsed) return parsed.response;
    const body = parsed.body as Record<string, unknown>;
    if (section === 'reports') {
      if (!['dismiss', 'hide', 'remove'].includes(String(body.action)))
        return fail(request, 'invalid', 'Choose an action for this report.');
      if (typeof body.reportId !== 'string' || !uuid.test(body.reportId))
        return fail(request, 'invalid', 'Choose a valid report.');
      const { data: report, error } = await db()
        .from('reports')
        .select('id,track_id,status')
        .eq('id', body.reportId)
        .maybeSingle();
      if (error) throw new Error(`admin report lookup: ${error.message}`);
      if (!report) return fail(request, 'not_found', 'Report not found.');
      if (body.action === 'dismiss') {
        const { error: updateError } = await db()
          .from('reports')
          .update({
            status: 'dismissed',
            handled_by: profile.id,
            handled_at: new Date().toISOString(),
          })
          .eq('id', report.id);
        if (updateError) throw new Error(`report dismiss: ${updateError.message}`);
        await audit(profile.id, 'dismiss_report', 'report', report.id);
      } else if (!report.track_id)
        return fail(request, 'invalid', 'This report has no song to change.');
      else if (body.action === 'hide') {
        const { error: updateError } = await db()
          .from('tracks')
          .update({ status: 'hidden' })
          .eq('id', report.track_id)
          .in('status', ['ready', 'hidden']);
        if (updateError) throw new Error(`track hide: ${updateError.message}`);
        await audit(profile.id, 'hide_track', 'track', report.track_id);
      } else await removeObjects(report.track_id, profile.id);
      return ok(request, { saved: true });
    }
    if (section === 'tracks') {
      if (body.action === 'remove' && typeof body.trackId === 'string' && uuid.test(body.trackId)) {
        await removeObjects(body.trackId, profile.id);
        return ok(request, { removed: true });
      }
      if (body.action === 'retry' && typeof body.trackId === 'string' && uuid.test(body.trackId)) {
        const { error } = await db()
          .from('upload_jobs')
          .update({
            state: 'queued',
            attempts: 0,
            lease_until: null,
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('track_id', body.trackId);
        if (error) throw new Error(`upload retry: ${error.message}`);
        const { error: trackError } = await db()
          .from('tracks')
          .update({ status: 'queued', error: null })
          .eq('id', body.trackId)
          .eq('status', 'failed');
        if (trackError) throw new Error(`track retry: ${trackError.message}`);
        await audit(profile.id, 'retry_upload', 'track', body.trackId);
        return ok(request, { queued: true, dispatched: await dispatchTranscode() }, 202);
      }
      return fail(request, 'invalid', 'Choose a valid track action.');
    }
    if (section === 'promos') {
      const problem = validPromo(body);
      if (problem) return fail(request, 'invalid', problem);
      if (
        typeof body.id !== 'string' ||
        !uuid.test(body.id) ||
        typeof body.imagePath !== 'string' ||
        !new RegExp(`^promos/${body.id}\\.(jpg|png|webp)$`, 'i').test(body.imagePath)
      )
        return fail(request, 'invalid', 'Upload a promo image first.');
      const payload = {
        kicker: body.kicker ?? '',
        title: (body.title as string).trim(),
        button_label: body.buttonLabel ?? 'Listen',
        image_path: body.imagePath,
        link: body.link,
        starts_at: body.startsAt ?? null,
        ends_at: body.endsAt ?? null,
        active: body.active === true,
        sort: Number.isInteger(body.sort) ? body.sort : 0,
      };
      const { data, error } = await db()
        .from('promos')
        .insert({ id: body.id, ...payload })
        .select('id')
        .single();
      if (error) throw new Error(`promo create: ${error.message}`);
      await audit(profile.id, 'create_promo', 'promo', data.id);
      return ok(request, { id: data.id }, 201);
    }
    if (section === 'emails') {
      if (!process.env.MARKETING_POSTAL_ADDRESS?.trim())
        return fail(request, 'invalid', 'Add a postal address before sending marketing email.');
      if (body.template !== 'marketing-announcement' && body.template !== 'marketing-weekly')
        return fail(request, 'invalid', 'Choose an email type.');
      if (
        typeof body.subject !== 'string' ||
        !body.subject.trim() ||
        body.subject.trim().length > 60
      )
        return fail(request, 'invalid', 'Add a subject up to 60 characters.');
      if (body.language !== undefined && !['en', 'pa', 'hi'].includes(String(body.language)))
        return fail(request, 'invalid', 'Choose English, Punjabi or Hindi.');
      const template = body.template;
      const content =
        body.content && typeof body.content === 'object' && !Array.isArray(body.content)
          ? (body.content as Record<string, unknown>)
          : {};
      const subject = body.subject.trim();
      const preheader = typeof body.preheader === 'string' ? body.preheader.slice(0, 90) : '';
      if (template === 'marketing-announcement') {
        if (
          typeof content.headline !== 'string' ||
          !content.headline.trim() ||
          content.headline.length > 80
        )
          return fail(request, 'invalid', 'Add a headline up to 80 characters.');
        if (typeof content.heroImage !== 'string' || !/^https:\/\/[^\s]+$/i.test(content.heroImage))
          return fail(request, 'invalid', 'Add an HTTPS hero image.');
        if (typeof content.ctaUrl !== 'string' || !/^https:\/\/[^\s]+$/i.test(content.ctaUrl))
          return fail(request, 'invalid', 'Use an HTTPS button link.');
        if (typeof content.body !== 'string' || content.body.length > 5000)
          return fail(request, 'invalid', 'Keep the message within 5,000 characters.');
      }
      let storedContent = content;
      if (template === 'marketing-weekly') {
        const trackIds = Array.isArray(body.trackIds) ? body.trackIds : [];
        if (
          trackIds.length !== 3 ||
          trackIds.some((id) => typeof id !== 'string' || !uuid.test(id)) ||
          new Set(trackIds).size !== 3
        )
          return fail(request, 'invalid', 'Choose exactly 3 songs for the weekly email.');
        const { data: weeklyTracks, error: tracksError } = await db()
          .from('tracks')
          .select('id,title,artist,language,status')
          .in('id', trackIds)
          .eq('status', 'ready');
        if (tracksError) throw new Error(`weekly email tracks: ${tracksError.message}`);
        if ((weeklyTracks ?? []).length !== 3)
          return fail(request, 'invalid', 'Choose 3 songs that are ready on Geet.');
        if (typeof content.ctaUrl !== 'string' || !/^https:\/\/[^\s]+$/i.test(content.ctaUrl))
          return fail(request, 'invalid', 'Use an HTTPS button link.');
        storedContent = { ...content, weeklyTracks };
      }
      const postalAddress = process.env.MARKETING_POSTAL_ADDRESS.trim();
      if (body.action === 'test') {
        const person = await fetchPerson(sub);
        if (!person.email || !person.emailVerified)
          return fail(request, 'forbidden', 'A verified admin email is required for a test send.');
        const vars = marketingVariables(
          template,
          storedContent,
          `[TEST] ${subject}`,
          preheader,
          profile.id,
          postalAddress,
        );
        const unsubscribeUrl = vars.unsubscribe_url!;
        const outcome = await sendTemplate(
          {
            kind: 'marketing',
            to: person.email,
            profileId: profile.id,
            idempotencyKey: `marketing-test:${profile.id}:${randomUUID()}`,
            priority: 10,
            headers: {
              'List-Unsubscribe': `<${unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          },
          template,
          vars,
        );
        return ok(request, { test: outcome });
      }
      const scheduledFor =
        typeof body.scheduledFor === 'string' ? new Date(body.scheduledFor) : new Date();
      if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now() - 60_000)
        return fail(request, 'invalid', 'Choose a valid send time.');
      const { data, error } = await db()
        .from('email_campaigns')
        .insert({
          template,
          language: body.language ?? 'en',
          subject,
          preheader,
          content: storedContent,
          scheduled_for: body.action === 'draft' ? null : scheduledFor.toISOString(),
          status: body.action === 'draft' ? 'draft' : 'scheduled',
          created_by: profile.id,
        })
        .select('id,status')
        .single();
      if (error) throw new Error(`email campaign: ${error.message}`);
      if (body.action === 'draft') {
        await audit(profile.id, 'save_email_draft', 'campaign', data.id);
        return ok(request, { campaign: data, recipients: 0, estimatedDays: 0 }, 201);
      }
      const { data: queued, error: queueError } = await db().rpc('queue_marketing_campaign', {
        p_campaign: data.id,
        p_language: body.language ?? 'en',
      });
      if (queueError) {
        await db().from('email_campaigns').update({ status: 'cancelled' }).eq('id', data.id);
        throw new Error(`marketing queue: ${queueError.message}`);
      }
      await audit(profile.id, 'create_email_campaign', 'campaign', data.id);
      const count = Number(queued ?? 0);
      return ok(
        request,
        {
          campaign: data,
          recipients: count,
          estimatedDays: Math.max(
            1,
            Math.ceil(count / Number(process.env.MARKETING_DAILY_CAP || 50)),
          ),
        },
        201,
      );
    }
    return fail(request, 'not_found', 'Admin action not found.');
  },
  { admin: true },
);

export const PATCH = withUser(
  async (request, { profile }, { params }: Params) => {
    const { section } = await params;
    const parsed = await readJson(request);
    if ('response' in parsed) return parsed.response;
    const body = parsed.body as Record<string, unknown>;
    if (section === 'tracks') {
      if (typeof body.trackId !== 'string' || !uuid.test(body.trackId))
        return fail(request, 'invalid', 'Choose a valid song.');
      if (body.action === 'hide' || body.action === 'unhide') {
        const status = body.action === 'hide' ? 'hidden' : 'ready';
        const { error } = await db()
          .from('tracks')
          .update({ status })
          .eq('id', body.trackId)
          .in('status', body.action === 'hide' ? ['ready', 'hidden'] : ['hidden']);
        if (error) throw new Error(`track visibility: ${error.message}`);
        await audit(
          profile.id,
          body.action === 'hide' ? 'hide_track' : 'unhide_track',
          'track',
          body.trackId,
        );
        return ok(request, { saved: true });
      }
      const allowed = ['title', 'artist', 'album', 'language', 'genre', 'translit'];
      const update = Object.fromEntries(
        Object.entries(body).filter(([key]) => allowed.includes(key)),
      );
      if (!Object.keys(update).length)
        return fail(request, 'invalid', 'Choose track details to edit.');
      const { error } = await db().from('tracks').update(update).eq('id', body.trackId);
      if (error) throw new Error(`track edit: ${error.message}`);
      await audit(profile.id, 'edit_track', 'track', body.trackId, Object.keys(update));
      return ok(request, { saved: true });
    }
    if (section === 'promos') {
      if (typeof body.id !== 'string' || !uuid.test(body.id))
        return fail(request, 'invalid', 'Choose a valid promo.');
      const problem = validPromo(body);
      if (problem) return fail(request, 'invalid', problem);
      const update: Record<string, unknown> = {
        kicker: body.kicker ?? '',
        title: body.title,
        button_label: body.buttonLabel ?? '',
        link: body.link,
        starts_at: body.startsAt ?? null,
        ends_at: body.endsAt ?? null,
        active: body.active === true,
        sort: Number.isInteger(body.sort) ? body.sort : 0,
      };
      if (body.imagePath !== undefined) {
        if (
          typeof body.imagePath !== 'string' ||
          !new RegExp(`^promos/${body.id}\\.(jpg|png|webp)$`, 'i').test(body.imagePath)
        )
          return fail(request, 'invalid', 'Upload a valid promo image.');
        update.image_path = body.imagePath;
      }
      const { error } = await db().from('promos').update(update).eq('id', body.id);
      if (error) throw new Error(`promo update: ${error.message}`);
      await audit(profile.id, 'edit_promo', 'promo', body.id);
      return ok(request, { saved: true });
    }
    if (section === 'reports' && typeof body.reportId === 'string' && uuid.test(body.reportId)) {
      const { error } = await db()
        .from('reports')
        .update({
          status: body.status === 'removed' ? 'removed' : 'dismissed',
          handled_by: profile.id,
          handled_at: new Date().toISOString(),
        })
        .eq('id', body.reportId)
        .eq('status', 'open');
      if (error) throw new Error(`report status: ${error.message}`);
      await audit(profile.id, 'update_report', 'report', body.reportId);
      return ok(request, { saved: true });
    }
    return fail(request, 'not_found', 'Admin action not found.');
  },
  { admin: true },
);

export const DELETE = withUser(
  async (request, { profile }, { params }: Params) => {
    const { section } = await params;
    const parsed = await readJson(request);
    if ('response' in parsed) return parsed.response;
    const body = parsed.body as { id?: unknown };
    if (section === 'promos' && typeof body.id === 'string' && uuid.test(body.id)) {
      const { data: promo, error: lookupError } = await db()
        .from('promos')
        .select('image_path')
        .eq('id', body.id)
        .maybeSingle();
      if (lookupError) throw new Error(`promo lookup: ${lookupError.message}`);
      if (!promo) return fail(request, 'not_found', 'Promo not found.');
      const { error } = await db().from('promos').delete().eq('id', body.id);
      if (error) throw new Error(`promo delete: ${error.message}`);
      if (promo.image_path) await storage().remove([promo.image_path]);
      await audit(profile.id, 'delete_promo', 'promo', body.id);
      return ok(request, { deleted: true });
    }
    if (section === 'emails' && typeof body.id === 'string' && uuid.test(body.id)) {
      const { error } = await db()
        .from('email_campaigns')
        .update({ status: 'cancelled' })
        .eq('id', body.id)
        .eq('status', 'scheduled');
      if (error) throw new Error(`campaign cancel: ${error.message}`);
      await audit(profile.id, 'cancel_email_campaign', 'campaign', body.id);
      return ok(request, { cancelled: true });
    }
    return fail(request, 'not_found', 'Admin item not found.');
  },
  { admin: true },
);

export function OPTIONS(request: Request) {
  return preflight(request);
}
