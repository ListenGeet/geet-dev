import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendTemplate = vi.hoisted(() => vi.fn());
const sendClerkBody = vi.hoisted(() => vi.fn());
vi.mock('../email/send', () => ({ sendTemplate, sendClerkBody }));

import { describePayload, handleClerkEmail } from './clerk-email';

beforeEach(() => {
  sendTemplate.mockReset().mockResolvedValue('sent');
  sendClerkBody.mockReset().mockResolvedValue('sent');
});

describe('handleClerkEmail', () => {
  it('renders Geet’s verification-code template from the otp code', async () => {
    const out = await handleClerkEmail(
      {
        slug: 'verification_code',
        to_email_address: 'me@x.co',
        user_id: 'user_1',
        delivered_by_clerk: false,
        data: { otp_code: '123456' },
      },
      'msg_1',
      'p1',
    );
    expect(out).toBe('sent');
    expect(sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'me@x.co',
        idempotencyKey: 'clerk-email:msg_1',
        kind: 'code',
        priority: 0,
        profileId: 'p1',
      }),
      'verification-code',
      { code: '123456', purpose: 'sign in', minutes: '10', email: 'me@x.co' },
    );
  });
  it('says "create your account" when there is no user yet', async () => {
    await handleClerkEmail(
      { slug: 'verification_code', to_email_address: 'me@x.co', data: { otp_code: '1' } },
      'm',
      null,
    );
    expect(sendTemplate.mock.calls[0]?.[2]?.purpose).toBe('create your account');
  });
  it('does nothing when Clerk delivered the email itself, so it never doubles up', async () => {
    expect(
      await handleClerkEmail(
        {
          slug: 'verification_code',
          to_email_address: 'me@x.co',
          delivered_by_clerk: true,
          data: { otp_code: '1' },
        },
        'm',
        null,
      ),
    ).toBe('skipped');
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(sendClerkBody).not.toHaveBeenCalled();
  });
  it('sends Clerk’s own body from security@ for a template Geet has no design for', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleClerkEmail(
      {
        slug: 'reset_password_code',
        to_email_address: 'me@x.co',
        subject: 'Reset',
        body: '<p>Hi</p>',
        body_plain: 'Hi',
      },
      'm2',
      null,
    );
    expect(sendClerkBody).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'clerk-email:m2' }),
      { subject: 'Reset', html: '<p>Hi</p>', text: 'Hi', slug: 'reset_password_code' },
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('refuses events with no recipient or no code', async () => {
    await expect(
      handleClerkEmail({ slug: 'verification_code', data: { otp_code: '1' } }, 'm', null),
    ).rejects.toThrow(/recipient/);
    await expect(
      handleClerkEmail(
        { slug: 'verification_code', to_email_address: 'me@x.co', data: {} },
        'm',
        null,
      ),
    ).rejects.toThrow(/otp_code/);
  });
});

describe('describePayload', () => {
  it('lists structure without printing the code, address or body', () => {
    const lines = describePayload(
      {
        slug: 'verification_code',
        to_email_address: 'secret@x.co',
        body: '<p>999999</p>',
        delivered_by_clerk: false,
        data: { otp_code: '999999' },
      },
      '$.data',
    ).join('\n');
    expect(lines).toContain('$.data.slug: string = "verification_code"');
    expect(lines).toContain('$.data.data.otp_code: string (6 chars)');
    expect(lines).toContain('$.data.delivered_by_clerk: boolean = false');
    expect(lines).not.toContain('secret@x.co');
    expect(lines).not.toContain('999999');
  });
});
