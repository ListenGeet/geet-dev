import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, escapeHtml } from './render';
import { sendViaResend, ResendError } from './resend';
import { deliveryFor, fromFor, replyToFor, parseAllowlist } from './send';
import { templates } from './templates.generated';

const root = join(__dirname, '..', '..', '..', '..');
const normalized = (value: string) => value.replace(/\r\n/g, '\n');

describe('templates', () => {
  it('the generated bundle matches emails/templates', () => {
    for (const [name, t] of Object.entries(templates)) {
      expect(t.html).toBe(
        normalized(readFileSync(join(root, 'emails/templates', `${name}.html`), 'utf8')),
      );
      expect(t.text).toBe(
        normalized(readFileSync(join(root, 'emails/templates', `${name}.txt`), 'utf8')),
      );
    }
  });
  it('verification-code fills every placeholder in both parts', () => {
    const r = render('verification-code', {
      code: '482913',
      purpose: 'sign in',
      minutes: '10',
      email: 'a@b.co',
    });
    expect(r.subject).toBe('482913 is your Geet code');
    expect(r.sender).toBe('security');
    expect(r.html).toContain('482913');
    expect(r.text).toContain('482913');
    expect(r.html).not.toMatch(/\{\{/);
    expect(r.text).not.toMatch(/\{\{/);
    expect(r.text.length).toBeGreaterThan(50);
  });
  it('welcome is from hello@ and says who it is for', () => {
    const r = render('welcome', {
      first_name: 'Hardeep',
      username: 'hardeep',
      app_url: 'https://listengeet.com',
      email: 'h@x.co',
    });
    expect(r.sender).toBe('hello');
    expect(r.subject).toBe('Welcome to Geet');
    expect(r.html).toContain('Hardeep');
    expect(r.text).toContain('@hardeep');
  });
  it('escapes values in HTML but not in the text part', () => {
    const r = render('welcome', {
      first_name: '<b>Al</b> & "Co"',
      username: 'x',
      app_url: 'https://a.co',
      email: 'a@b.co',
    });
    expect(r.html).toContain('&lt;b&gt;Al&lt;/b&gt; &amp; &quot;Co&quot;');
    expect(r.html).not.toContain('<b>Al</b>');
    expect(r.text).toContain('<b>Al</b> & "Co"');
  });
  it('throws when a placeholder has no value', () => {
    expect(() => render('verification-code', { code: '1' })).toThrow(
      /Template verification-code needs "/,
    );
  });
  it('keeps line breaks out of the subject', () => {
    expect(
      render('marketing-announcement', {
        subject: 'Hi\r\nBcc: x@y.z',
        preheader: '',
        hero_image: '',
        hero_alt: '',
        kicker: '',
        headline: '',
        body_html: '',
        body_text: '',
        cta_label: '',
        cta_url: '',
        unsubscribe_url: '',
        preferences_url: '',
        postal_address: '',
      }).subject,
    ).toBe('Hi Bcc: x@y.z');
  });
  it('escapeHtml covers the five characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
  it('each template stays under 100 KB (Gmail clips at about 102 KB)', () => {
    for (const t of Object.values(templates))
      expect(Buffer.byteLength(t.html)).toBeLessThan(100_000);
  });
});

describe('dev allowlist', () => {
  it('sends to anyone in production (no allowlist, not a dev host)', () => {
    expect(deliveryFor('a@b.co', { NEXT_PUBLIC_APP_URL: 'https://listengeet.com' })).toEqual({
      send: true,
      subjectPrefix: '',
    });
  });
  it('drops addresses that are not on the list and prefixes the ones that are', () => {
    const env = {
      EMAIL_DEV_ALLOWLIST: 'Me@x.co, you@x.co',
      NEXT_PUBLIC_APP_URL: 'https://listengeet.com',
    };
    expect(deliveryFor('me@x.co', env)).toEqual({ send: true, subjectPrefix: '[DEV] ' });
    expect(deliveryFor('stranger@x.co', env)).toEqual({ send: false, subjectPrefix: '[DEV] ' });
  });
  it('a dev host with no list sends to nobody', () => {
    expect(deliveryFor('me@x.co', { NEXT_PUBLIC_APP_URL: 'https://dev.listengeet.com' }).send).toBe(
      false,
    );
    expect(deliveryFor('me@x.co', { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' }).send).toBe(
      false,
    );
  });
  it('an empty list means nobody', () => {
    expect(deliveryFor('me@x.co', { EMAIL_DEV_ALLOWLIST: '' }).send).toBe(false);
    expect(parseAllowlist(' A@b.co,, ')).toEqual(['a@b.co']);
  });
});

describe('senders', () => {
  const env = {
    EMAIL_FROM_SECURITY: 'Geet Security <security@listengeet.com>',
    EMAIL_FROM_HELLO: 'Geet <hello@listengeet.com>',
    EMAIL_REPLY_TO_SUPPORT: 'support@listengeet.com',
  };
  it('security replies go to support, hello replies to itself', () => {
    expect(fromFor('security', env)).toBe('Geet Security <security@listengeet.com>');
    expect(replyToFor('security', env)).toBe('support@listengeet.com');
    expect(replyToFor('hello', env)).toBe('hello@listengeet.com');
  });
  it('a missing sender variable is an error', () => {
    expect(() => fromFor('marketing', env)).toThrow(/EMAIL_FROM_MARKETING/);
  });
});

describe('sendViaResend', () => {
  const saved = process.env.RESEND_API_KEY;
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key_123';
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = saved;
  });
  const email = {
    from: 'Geet <hello@listengeet.com>',
    to: 'a@b.co',
    subject: 'S',
    html: '<p>h</p>',
    text: 't',
    replyTo: 'hello@listengeet.com',
    idempotencyKey: 'welcome:user_1',
  };

  it('posts html and text with the idempotency key', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'abc' }), { status: 200 }));
    expect(await sendViaResend(email, f as unknown as typeof fetch)).toEqual({ id: 'abc' });
    const [url, init] = f.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers['Idempotency-Key']).toBe('welcome:user_1');
    expect(init.headers.Authorization).toBe('Bearer re_test_key_123');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      from: email.from,
      to: ['a@b.co'],
      subject: 'S',
      html: '<p>h</p>',
      text: 't',
      reply_to: 'hello@listengeet.com',
    });
  });
  it('throws a ResendError that holds no address or body', async () => {
    const f = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ name: 'rate_limit_exceeded', message: 'a@b.co' }), {
        status: 429,
      }),
    );
    const err = await sendViaResend(email, f as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(ResendError);
    expect(err.status).toBe(429);
    expect(err.message).not.toContain('a@b.co');
  });
});
