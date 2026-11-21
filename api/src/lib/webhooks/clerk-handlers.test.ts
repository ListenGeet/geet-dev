import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  profileBySubject: vi.fn(),
  ensureProfile: vi.fn(),
  isSuppressed: vi.fn(),
  claimWelcome: vi.fn(),
  releaseWelcome: vi.fn(),
  deleteProfile: vi.fn(),
}));
const sendTemplate = vi.hoisted(() => vi.fn());
vi.mock('../repo', () => repo);
vi.mock('../email/send', () => ({ sendTemplate, sendClerkBody: vi.fn() }));

import { handleClerkEvent } from './clerk';

const user = {
  id: 'user_1',
  first_name: 'Hardeep',
  last_name: 'Singh',
  image_url: 'https://img.clerk.com/x',
  username: null,
  primary_email_address_id: 'idn_1',
  email_addresses: [
    { id: 'idn_1', email_address: 'Hardeep@Example.com', verification: { status: 'verified' } },
  ],
};
const profile = { id: 'p1', username: null, welcome_sent_at: null };

beforeEach(() => {
  Object.values(repo).forEach((m) => m.mockReset());
  sendTemplate.mockReset().mockResolvedValue('sent');
  repo.profileBySubject.mockResolvedValue(null);
  repo.ensureProfile.mockResolvedValue(profile);
  repo.isSuppressed.mockResolvedValue(false);
  repo.claimWelcome.mockResolvedValue(true);
  process.env.NEXT_PUBLIC_APP_URL = 'https://listengeet.com/';
  process.env.ADMIN_EMAILS = 'hardeep@example.com';
});

describe('user.created', () => {
  it('creates the profile, makes a verified admin address an admin, and sends the welcome once', async () => {
    expect(await handleClerkEvent({ type: 'user.created', data: user }, 'm1')).toBe('welcome_sent');
    expect(repo.ensureProfile).toHaveBeenCalledWith(
      'user_1',
      'Hardeep Singh',
      'https://img.clerk.com/x',
      'admin',
    );
    expect(sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'welcome',
        to: 'hardeep@example.com',
        idempotencyKey: 'welcome:user_1',
      }),
      'welcome',
      {
        first_name: 'Hardeep',
        app_url: 'https://listengeet.com',
        email: 'hardeep@example.com',
      },
    );
  });
  it('does not make an unverified address an admin', async () => {
    const unverified = {
      ...user,
      email_addresses: [
        {
          id: 'idn_1',
          email_address: 'hardeep@example.com',
          verification: { status: 'unverified' },
        },
      ],
    };
    await handleClerkEvent({ type: 'user.created', data: unverified }, 'm1');
    expect(repo.ensureProfile.mock.calls[0]?.[3]).toBe('user');
  });
  it('does not send again when the welcome was already sent', async () => {
    repo.profileBySubject.mockResolvedValue({
      ...profile,
      welcome_sent_at: '2026-11-01T00:00:00Z',
    });
    expect(await handleClerkEvent({ type: 'user.created', data: user }, 'm2')).toBe(
      'welcome_skipped',
    );
    expect(sendTemplate).not.toHaveBeenCalled();
  });
  it('does not send when another delivery already claimed it', async () => {
    repo.claimWelcome.mockResolvedValue(false);
    expect(await handleClerkEvent({ type: 'user.created', data: user }, 'm3')).toBe(
      'welcome_skipped',
    );
    expect(sendTemplate).not.toHaveBeenCalled();
  });
  it('skips an address that bounced or complained', async () => {
    repo.isSuppressed.mockResolvedValue(true);
    expect(await handleClerkEvent({ type: 'user.created', data: user }, 'm4')).toBe(
      'welcome_skipped',
    );
    expect(sendTemplate).not.toHaveBeenCalled();
  });
  it('releases the claim and fails when sending fails, so the retry can send', async () => {
    sendTemplate.mockRejectedValue(new Error('resend down'));
    await expect(handleClerkEvent({ type: 'user.created', data: user }, 'm5')).rejects.toThrow(
      'resend down',
    );
    expect(repo.releaseWelcome).toHaveBeenCalledWith('p1');
  });
  it('a dropped dev email counts as skipped', async () => {
    sendTemplate.mockResolvedValue('dropped');
    expect(await handleClerkEvent({ type: 'user.created', data: user }, 'm6')).toBe(
      'welcome_skipped',
    );
  });
});

describe('user.deleted', () => {
  it('deletes the profile', async () => {
    repo.profileBySubject.mockResolvedValue(profile);
    expect(
      await handleClerkEvent({ type: 'user.deleted', data: { id: 'user_1', deleted: true } }, 'm'),
    ).toBe('deleted');
    expect(repo.deleteProfile).toHaveBeenCalledWith('p1');
  });
  it('is quiet when the profile is already gone', async () => {
    expect(await handleClerkEvent({ type: 'user.deleted', data: { id: 'user_1' } }, 'm')).toBe(
      'ignored',
    );
    expect(repo.deleteProfile).not.toHaveBeenCalled();
  });
});

describe('other events', () => {
  it('acknowledges and ignores them', async () => {
    expect(await handleClerkEvent({ type: 'session.created', data: {} }, 'm')).toBe('ignored');
  });
});
