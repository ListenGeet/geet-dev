export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey: string;
}

export class ResendError extends Error {
  constructor(
    public readonly status: number,
    public readonly kind: string,
  ) {
    super(`Resend refused the email (${status} ${kind})`);
  }
}

/**
 * Sends one email through Resend's REST API. Both html and text are always sent.
 * The error carries the status and Resend's error name only: never the address or the body.
 */
export async function sendViaResend(
  email: OutgoingEmail,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': email.idempotencyKey,
    },
    body: JSON.stringify({
      from: email.from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string };
  if (!res.ok || !body.id)
    throw new ResendError(res.status, typeof body.name === 'string' ? body.name : 'unknown');
  return { id: body.id };
}
