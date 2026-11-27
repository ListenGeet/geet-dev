import { isDevHost } from '@geet/shared';
import * as repo from '../repo';
import { render, type Sender, type TemplateName } from './render';
import { sendViaResend, type OutgoingEmail } from './resend';

type Env = Record<string, string | undefined>;

export function parseAllowlist(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export interface Delivery {
  send: boolean;
  subjectPrefix: string;
}

/**
 * Dev can never email real people (docs/20 §1). The allowlist applies when EMAIL_DEV_ALLOWLIST is set or the
 * app runs on a dev host. Then only listed addresses get mail, with a [DEV] subject prefix; others are dropped.
 */
export function deliveryFor(to: string, env: Env = process.env): Delivery {
  const list = parseAllowlist(env.EMAIL_DEV_ALLOWLIST);
  const restricted =
    list.length > 0 || env.EMAIL_DEV_ALLOWLIST !== undefined || isDevHost(env.NEXT_PUBLIC_APP_URL);
  if (!restricted) return { send: true, subjectPrefix: '' };
  return { send: list.includes(to.trim().toLowerCase()), subjectPrefix: '[DEV] ' };
}

const SENDER_ENV: Record<Sender, string> = {
  security: 'EMAIL_FROM_SECURITY',
  hello: 'EMAIL_FROM_HELLO',
  marketing: 'EMAIL_FROM_MARKETING',
  copyright: 'EMAIL_FROM_COPYRIGHT',
  alerts: 'EMAIL_FROM_ALERTS',
};

export function fromFor(sender: Sender, env: Env = process.env): string {
  const value = env[SENDER_ENV[sender]];
  if (!value) throw new Error(`${SENDER_ENV[sender]} is not set`);
  return value;
}

/** hello@ replies to itself, security@ replies go to support@ (docs/20 §1). */
export function replyToFor(sender: Sender, env: Env = process.env): string | undefined {
  if (sender === 'security') return env.EMAIL_REPLY_TO_SUPPORT || undefined;
  const address = /<([^<>]+)>/.exec(env[SENDER_ENV[sender]] ?? '')?.[1];
  return address;
}

export type SendOutcome = 'sent' | 'duplicate' | 'dropped';

interface Common {
  kind: 'code' | 'welcome' | 'alert' | 'marketing' | 'copyright' | 'digest';
  to: string;
  profileId: string | null;
  idempotencyKey: string;
  priority?: number;
  campaignId?: string | null;
  headers?: Record<string, string>;
}

interface Prepared {
  sender: Sender;
  subject: string;
  html: string;
  text: string;
  template: string;
}

/**
 * The one path every email takes: one job row per idempotency key, the dev allowlist, Resend, then a log row
 * with no address and no body. A repeated key that already succeeded is not sent again.
 */
async function deliver(common: Common, mail: Prepared): Promise<SendOutcome> {
  const job = await repo.upsertEmailJob({
    kind: common.kind,
    template: mail.template,
    profileId: common.profileId,
    priority: common.priority ?? 5,
    idempotencyKey: common.idempotencyKey,
    campaignId: common.campaignId,
  });
  if (job.state === 'sent' || job.state === 'cancelled') return 'duplicate';

  const log = { template: mail.template, profileId: common.profileId };
  const delivery = deliveryFor(common.to);
  if (!delivery.send) {
    console.warn(`[email] dropped ${mail.template}: recipient is not on EMAIL_DEV_ALLOWLIST`);
    await repo.finishEmailJob(job.id, 'cancelled', job.attempts, {
      ...log,
      resendId: null,
      status: 'dropped_dev_allowlist',
    });
    return 'dropped';
  }

  try {
    const outgoing: OutgoingEmail = {
      from: fromFor(mail.sender),
      to: common.to,
      subject: delivery.subjectPrefix + mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: replyToFor(mail.sender),
      idempotencyKey: common.idempotencyKey,
      headers: common.headers,
    };
    const { id } = await sendViaResend(outgoing);
    await repo.finishEmailJob(job.id, 'sent', job.attempts + 1, {
      ...log,
      resendId: id,
      status: 'sent',
    });
    return 'sent';
  } catch (err) {
    await repo.finishEmailJob(job.id, 'failed', job.attempts + 1, {
      ...log,
      resendId: null,
      status: 'failed',
    });
    throw err;
  }
}

/** Sends one of Geet's own templates. */
export async function sendTemplate(
  common: Common,
  template: TemplateName,
  vars: Record<string, string>,
): Promise<SendOutcome> {
  const r = render(template, vars);
  return deliver(common, {
    sender: r.sender,
    subject: r.subject,
    html: r.html,
    text: r.text,
    template,
  });
}

/** Fail-safe for a Clerk email Geet has no design for: Clerk's own body, from security@ (docs/20 §3.5). */
export async function sendClerkBody(
  common: Common,
  mail: { subject: string; html: string; text: string; slug: string },
): Promise<SendOutcome> {
  return deliver(common, {
    sender: 'security',
    subject: mail.subject.replace(/[\r\n]+/g, ' ').trim(),
    html: mail.html,
    text: mail.text,
    template: `clerk:${mail.slug}`.slice(0, 80),
  });
}
