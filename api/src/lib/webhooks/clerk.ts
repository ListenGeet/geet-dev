import { isDevHost } from '@geet/shared';
import { personFromWebhook, roleFor, type ClerkPerson } from '../clerk';
import { sendTemplate } from '../email/send';
import * as repo from '../repo';
import { describePayload, handleClerkEmail, type ClerkEmailData } from './clerk-email';

export interface ClerkEvent {
  type: string;
  data: Record<string, unknown>;
}

export type Handled =
  'welcome_sent' | 'welcome_skipped' | 'deleted' | 'email_sent' | 'email_skipped' | 'ignored';

const firstName = (person: ClerkPerson): string =>
  (person.displayName ?? 'there').split(' ')[0] ?? 'there';

async function onUserCreated(data: Record<string, unknown>): Promise<Handled> {
  const sub = String(data.id ?? '');
  if (!sub) throw new Error('user.created without an id');
  const person = personFromWebhook(data);
  const profile =
    (await repo.profileBySubject(sub)) ??
    (await repo.ensureProfile(sub, person.displayName, person.avatarUrl, roleFor(person)));

  if (profile.welcome_sent_at || !person.email) return 'welcome_skipped';
  if (await repo.isSuppressed(profile.id)) return 'welcome_skipped';
  if (!(await repo.claimWelcome(profile.id))) return 'welcome_skipped';

  try {
    const outcome = await sendTemplate(
      {
        kind: 'welcome',
        to: person.email,
        profileId: profile.id,
        idempotencyKey: `welcome:${sub}`,
        priority: 3,
      },
      'welcome',
      {
        first_name: firstName(person),
        app_url: (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, ''),
        email: person.email,
      },
    );
    return outcome === 'sent' ? 'welcome_sent' : 'welcome_skipped';
  } catch (err) {
    await repo.releaseWelcome(profile.id); // let Svix's retry try again
    throw err;
  }
}

async function onUserDeleted(data: Record<string, unknown>): Promise<Handled> {
  const sub = String(data.id ?? '');
  if (!sub) return 'ignored';
  const profile = await repo.profileBySubject(sub);
  if (!profile) return 'ignored'; // DELETE /api/me already removed it
  await repo.deleteProfile(profile.id); // uploaded tracks stay: they are only removed when the person chose to
  return 'deleted';
}

async function onEmail(data: Record<string, unknown>, eventId: string): Promise<Handled> {
  if (isDevHost(process.env.NEXT_PUBLIC_APP_URL) || process.env.LOG_WEBHOOK_PAYLOADS === '1') {
    console.info(
      `[webhook] first-payload map for ${eventId}:\n${describePayload(data, '$.data').join('\n')}`,
    );
  }
  const email = data as ClerkEmailData;
  const profile = email.user_id ? await repo.profileBySubject(email.user_id) : null;
  const outcome = await handleClerkEmail(email, eventId, profile?.id ?? null);
  return outcome === 'skipped' || outcome === 'duplicate' || outcome === 'dropped'
    ? 'email_skipped'
    : 'email_sent';
}

/** Dispatches a verified Clerk event. Unknown types are acknowledged and ignored. */
export async function handleClerkEvent(event: ClerkEvent, eventId: string): Promise<Handled> {
  switch (event.type) {
    case 'user.created':
      return onUserCreated(event.data);
    case 'user.deleted':
      return onUserDeleted(event.data);
    case 'email.created':
    case 'emails.created':
      return onEmail(event.data, eventId);
    default:
      return 'ignored';
  }
}
