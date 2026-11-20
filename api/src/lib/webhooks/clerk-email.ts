import { sendClerkBody, sendTemplate, type SendOutcome } from '../email/send';

/** Clerk's email event as documented. Field names are confirmed against the first real payload (see describePayload). */
export interface ClerkEmailData {
  id?: string;
  slug?: string;
  subject?: string;
  body?: string;
  body_plain?: string;
  to_email_address?: string;
  user_id?: string | null;
  delivered_by_clerk?: boolean;
  data?: { otp_code?: string; [k: string]: unknown };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Clerk's one-time codes live for 10 minutes. */
export const CODE_MINUTES = '10';

/**
 * Handles an email event (`email.created`, called `emails.created` in older docs).
 * - Clerk delivered it itself: nothing to do, sending again would double the email.
 * - verification_code: Geet's own template, from security@.
 * - any other template: Clerk's own rendered body from security@, so nobody is locked out.
 */
export async function handleClerkEmail(
  data: ClerkEmailData,
  eventId: string,
  profileId: string | null,
): Promise<SendOutcome | 'skipped'> {
  if (data.delivered_by_clerk === true) return 'skipped';
  const to = str(data.to_email_address).trim();
  if (!to) throw new Error('Clerk email event has no recipient');

  const common = {
    kind: 'code' as const,
    to,
    profileId,
    idempotencyKey: `clerk-email:${eventId}`,
    priority: 0,
  };
  const slug = str(data.slug);

  if (slug === 'verification_code') {
    const code = str(data.data?.otp_code);
    if (!code) throw new Error('Clerk verification email has no otp_code');
    // A person with no user yet is signing up; an existing user is signing in.
    const purpose = data.user_id ? 'sign in' : 'create your account';
    return sendTemplate(common, 'verification-code', {
      code,
      purpose,
      minutes: CODE_MINUTES,
      email: to,
    });
  }

  console.warn(
    `[email] Clerk template "${slug}" has no Geet design yet: sending Clerk's own body. Add a template.`,
  );
  const html = str(data.body);
  const text =
    str(data.body_plain) ||
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  if (!html && !text) throw new Error('Clerk email event has no body');
  return sendClerkBody(common, {
    subject: str(data.subject) || 'Geet',
    html: html || `<pre>${text}</pre>`,
    text,
    slug,
  });
}

const SHOWN_KEYS = new Set([
  'object',
  'type',
  'slug',
  'status',
  'delivered_by_clerk',
  'from_email_name',
  'reply_to_email_name',
]);

/**
 * A structure-only view of a payload for the dev log: every key path with its type, and the value only for a
 * few non-personal keys. The code, address, subject and body are never printed.
 */
export function describePayload(value: unknown, path = '$'): string[] {
  if (value === null || typeof value !== 'object') {
    const key = path.split('.').pop() ?? '';
    const shown = SHOWN_KEYS.has(key)
      ? ` = ${JSON.stringify(value)}`
      : typeof value === 'string'
        ? ` (${value.length} chars)`
        : '';
    return [`${path}: ${typeof value}${shown}`];
  }
  if (Array.isArray(value))
    return [
      `${path}: array(${value.length})`,
      ...value.slice(0, 1).flatMap((v) => describePayload(v, `${path}[0]`)),
    ];
  return Object.entries(value).flatMap(([k, v]) => describePayload(v, `${path}.${k}`));
}
