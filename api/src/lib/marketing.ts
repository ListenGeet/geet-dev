import { createHmac, timingSafeEqual } from 'node:crypto';
import { escapeHtml } from './email/render';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function key() {
  const value = process.env.CRON_SECRET;
  if (!value || value.length < 16)
    throw new Error('CRON_SECRET must be set to sign unsubscribe links');
  return value;
}

export function makeUnsubscribeToken(profileId: string): string {
  if (!uuid.test(profileId)) throw new Error('Invalid profile id');
  const signature = createHmac('sha256', key()).update(profileId).digest('base64url');
  return `${profileId}.${signature}`;
}

export function readUnsubscribeToken(token: string): string | null {
  const [profileId, signature, extra] = token.split('.');
  if (extra || !profileId || !signature || !uuid.test(profileId)) return null;
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = createHmac('sha256', key()).update(profileId).digest();
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? profileId : null;
}

export function absoluteAppUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://listengeet.com').replace(/\/$/, '');
  return new URL(path, `${base}/`).toString();
}

export function announcementHtml(text: string): string {
  const escaped = escapeHtml(text);
  const bold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const linked = bold.replace(
    /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,
    (_match, label: string, href: string) => `<a href="${href}" style="color:#FFDC00">${label}</a>`,
  );
  return linked.replace(/\r?\n/g, '<br>');
}

export function marketingVariables(
  template: 'marketing-announcement' | 'marketing-weekly',
  content: Record<string, unknown>,
  subject: string,
  preheader: string,
  profileId: string,
  postalAddress: string,
): Record<string, string> {
  const token = encodeURIComponent(makeUnsubscribeToken(profileId));
  const base = {
    subject,
    preheader,
    unsubscribe_url: absoluteAppUrl(`/email/unsubscribe?t=${token}`),
    preferences_url: absoluteAppUrl('/profile'),
    postal_address: postalAddress,
  };
  if (template === 'marketing-announcement') {
    const body = typeof content.body === 'string' ? content.body : '';
    return {
      ...base,
      hero_image: typeof content.heroImage === 'string' ? content.heroImage : '',
      hero_alt: typeof content.heroAlt === 'string' ? content.heroAlt : '',
      kicker: typeof content.kicker === 'string' ? content.kicker : '',
      headline: typeof content.headline === 'string' ? content.headline : '',
      body_html: announcementHtml(body),
      body_text: body,
      cta_label: typeof content.ctaLabel === 'string' ? content.ctaLabel : 'Listen',
      cta_url: typeof content.ctaUrl === 'string' ? content.ctaUrl : absoluteAppUrl('/'),
    };
  }
  const tracks = Array.isArray(content.weeklyTracks)
    ? (content.weeklyTracks.slice(0, 3) as {
        id?: unknown;
        title?: unknown;
        artist?: unknown;
        language?: unknown;
      }[])
    : [];
  const vars: Record<string, string> = {
    ...base,
    headline: typeof content.headline === 'string' ? content.headline : 'New on Geet this week',
    intro: typeof content.intro === 'string' ? content.intro : '',
    cta_url: typeof content.ctaUrl === 'string' ? content.ctaUrl : absoluteAppUrl('/'),
  };
  for (let index = 0; index < 3; index++) {
    const track = tracks[index] ?? {};
    const id = typeof track.id === 'string' ? track.id : '';
    const number = index + 1;
    vars[`track${number}_title`] = typeof track.title === 'string' ? track.title : '';
    vars[`track${number}_artist`] = typeof track.artist === 'string' ? track.artist : '';
    vars[`track${number}_language`] =
      typeof track.language === 'string' ? track.language : 'English';
    vars[`track${number}_url`] = id ? absoluteAppUrl(`/t/${id}`) : absoluteAppUrl('/');
    vars[`track${number}_cover`] = id
      ? absoluteAppUrl(`/api/cover/${id}`)
      : absoluteAppUrl('/og/geet-default.jpg');
  }
  return vars;
}
