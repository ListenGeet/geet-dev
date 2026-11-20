import { Webhook } from 'svix';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleClerkEvent = vi.hoisted(() => vi.fn());
vi.mock('@/lib/webhooks/clerk', () => ({ handleClerkEvent }));

import { POST } from './route';

const SECRET = 'whsec_' + Buffer.from('test-secret-0123456789abcdef').toString('base64');
const payload = JSON.stringify({ type: 'user.created', data: { id: 'user_1' } });

function signed(body = payload, id = 'msg_1', when = new Date()) {
  const signature = new Webhook(SECRET).sign(id, when, body);
  return new Request('https://dev-api.listengeet.com/api/webhooks/clerk', {
    method: 'POST',
    body,
    headers: {
      'svix-id': id,
      'svix-timestamp': String(Math.floor(when.getTime() / 1000)),
      'svix-signature': signature,
    },
  });
}

beforeEach(() => {
  process.env.CLERK_WEBHOOK_SECRET = SECRET;
  handleClerkEvent.mockReset().mockResolvedValue('welcome_sent');
});

describe('POST /api/webhooks/clerk', () => {
  it('rejects a request with no signature headers with 401', async () => {
    const res = await POST(
      new Request('https://x.test/api/webhooks/clerk', { method: 'POST', body: payload }),
    );
    expect(res.status).toBe(401);
    expect(handleClerkEvent).not.toHaveBeenCalled();
  });
  it('rejects a forged signature with 401 and does nothing', async () => {
    const res = await POST(
      new Request('https://x.test/api/webhooks/clerk', {
        method: 'POST',
        body: payload,
        headers: {
          'svix-id': 'msg_1',
          'svix-timestamp': String(Math.floor(Date.now() / 1000)),
          'svix-signature': 'v1,Zm9yZ2Vk',
        },
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'unauthorized', message: 'Signature check failed.' },
    });
    expect(handleClerkEvent).not.toHaveBeenCalled();
  });
  it('rejects a valid signature over a different body', async () => {
    const good = signed();
    const res = await POST(
      new Request(good.url, {
        method: 'POST',
        body: payload.replace('user_1', 'user_2'),
        headers: good.headers,
      }),
    );
    expect(res.status).toBe(401);
    expect(handleClerkEvent).not.toHaveBeenCalled();
  });
  it('rejects a signed message that is too old (replay)', async () => {
    const res = await POST(signed(payload, 'msg_old', new Date(Date.now() - 60 * 60 * 1000)));
    expect(res.status).toBe(401);
  });
  it('accepts a valid signature and passes the Svix id as the idempotency key', async () => {
    const res = await POST(signed(payload, 'msg_42'));
    expect(res.status).toBe(200);
    expect(handleClerkEvent).toHaveBeenCalledWith(
      { type: 'user.created', data: { id: 'user_1' } },
      'msg_42',
    );
  });
  it('answers 500 when a handler fails, so Svix retries', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleClerkEvent.mockRejectedValue(new Error('resend down'));
    expect((await POST(signed())).status).toBe(500);
    err.mockRestore();
  });
  it('fails closed when the secret is not set', async () => {
    delete process.env.CLERK_WEBHOOK_SECRET;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await POST(signed())).status).toBe(500);
    err.mockRestore();
  });
});
