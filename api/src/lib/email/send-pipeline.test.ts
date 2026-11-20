import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({ upsertEmailJob: vi.fn(), finishEmailJob: vi.fn() }));
vi.mock('../repo', () => repo);

import { sendTemplate } from './send';

const env = {
  RESEND_API_KEY: 're_test_key_123',
  EMAIL_FROM_SECURITY: 'Geet Security <security@listengeet.com>',
  EMAIL_REPLY_TO_SUPPORT: 'support@listengeet.com',
  EMAIL_DEV_ALLOWLIST: 'me@x.co',
  NEXT_PUBLIC_APP_URL: 'https://listengeet.com',
};
const common = {
  kind: 'code' as const,
  to: 'me@x.co',
  profileId: 'p1',
  idempotencyKey: 'clerk-email:m1',
  priority: 0,
};
const vars = { code: '123456', purpose: 'sign in', minutes: '10', email: 'me@x.co' };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  Object.assign(process.env, env);
  Object.values(repo).forEach((m) => m.mockReset());
  repo.upsertEmailJob.mockResolvedValue({ id: 'j1', state: 'queued', attempts: 0 });
  fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ id: 're_1' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('sendTemplate', () => {
  it('sends an allowlisted address from security@ with a [DEV] subject, then logs without address or body', async () => {
    expect(await sendTemplate(common, 'verification-code', vars)).toBe('sent');
    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1].body);
    expect(sent.from).toBe('Geet Security <security@listengeet.com>');
    expect(sent.subject).toBe('[DEV] 123456 is your Geet code');
    expect(sent.reply_to).toBe('support@listengeet.com');
    expect(sent.html).toContain('123456');
    expect(sent.text).toContain('123456');
    expect(repo.finishEmailJob).toHaveBeenCalledWith('j1', 'sent', 1, {
      template: 'verification-code',
      profileId: 'p1',
      resendId: 're_1',
      status: 'sent',
    });
    expect(JSON.stringify(repo.finishEmailJob.mock.calls)).not.toContain('me@x.co');
    expect(JSON.stringify(repo.finishEmailJob.mock.calls)).not.toContain('123456');
  });
  it('drops an address that is not on EMAIL_DEV_ALLOWLIST and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      await sendTemplate({ ...common, to: 'stranger@x.co' }, 'verification-code', {
        ...vars,
        email: 'stranger@x.co',
      }),
    ).toBe('dropped');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repo.finishEmailJob).toHaveBeenCalledWith(
      'j1',
      'cancelled',
      0,
      expect.objectContaining({ status: 'dropped_dev_allowlist', resendId: null }),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not on EMAIL_DEV_ALLOWLIST'));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('stranger@x.co');
    warn.mockRestore();
  });
  it('does not send twice for the same idempotency key', async () => {
    repo.upsertEmailJob.mockResolvedValue({ id: 'j1', state: 'sent', attempts: 1 });
    expect(await sendTemplate(common, 'verification-code', vars)).toBe('duplicate');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('retries a job that failed before, and records a new failure', async () => {
    repo.upsertEmailJob.mockResolvedValue({ id: 'j1', state: 'failed', attempts: 1 });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ name: 'rate_limit_exceeded' }), { status: 429 }),
    );
    await expect(sendTemplate(common, 'verification-code', vars)).rejects.toThrow(/429/);
    expect(repo.finishEmailJob).toHaveBeenCalledWith(
      'j1',
      'failed',
      2,
      expect.objectContaining({ status: 'failed' }),
    );
  });
});
