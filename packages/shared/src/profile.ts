/** Rules shared by the API (authority) and the web (live hints). docs/05, docs/13, docs/15. */

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,20}$/;
export const USERNAME_COOLDOWN_DAYS = 30;

/** Names nobody can take: they look like the service or a role. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'geet',
  'geetapp',
  'support',
  'help',
  'security',
  'hello',
  'marketing',
  'copyright',
  'alerts',
  'root',
  'system',
  'moderator',
  'mod',
  'staff',
  'team',
  'official',
  'api',
  'www',
  'mail',
  'null',
  'undefined',
  'me',
  'you',
]);

export type UsernameProblem = 'too_short' | 'too_long' | 'characters' | 'reserved';

/** Lowercases and trims, the same way for every caller. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/^@/, '');
}

export function usernameProblem(name: string): UsernameProblem | null {
  if (name.length < 3) return 'too_short';
  if (name.length > 20) return 'too_long';
  if (!USERNAME_PATTERN.test(name)) return 'characters';
  if (RESERVED_USERNAMES.has(name)) return 'reserved';
  return null;
}

/** Plain-words messages for a username that fails the rules. Used by the API and by the live hint. */
export const USERNAME_PROBLEM_TEXT: Record<UsernameProblem, string> = {
  too_short: 'Usernames need at least 3 characters.',
  too_long: 'Usernames can be at most 20 characters.',
  characters: 'Use only letters a to z, numbers, underscore and dot.',
  reserved: 'That name is not available.',
};

/** What GET /api/me returns (docs/15). */
export interface MeDto {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'user' | 'uploader' | 'admin';
  language: 'en' | 'pa' | 'hi';
  musicLanguages: string[];
  favouriteArtists: string[];
  showListening: 'friends' | 'nobody';
  acceptRequests: 'everyone' | 'nobody';
  emailNews: boolean;
  autoplaySimilar: boolean;
  showLyrics: boolean;
  keepScreenAwake: boolean;
  onboarded: boolean;
  usernameChangeableAt: string | null;
  counts: { favourites: number; playlists: number; friends: number };
}

export interface UsernameAvailability {
  name: string;
  available: boolean;
  yours: boolean;
  problem: UsernameProblem | null;
}

export const LANGUAGES = ['en', 'pa', 'hi'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Music languages are catalogue tags, not UI languages: the three first-class ones plus free text from uploads. */
export const MUSIC_LANGUAGE_PATTERN = /^[a-z]{2,3}$/;

export const SHOW_LISTENING = ['friends', 'nobody'] as const;
export const ACCEPT_REQUESTS = ['everyone', 'nobody'] as const;

export interface ProfilePatch {
  displayName?: string;
  language?: Language;
  musicLanguages?: string[];
  favouriteArtists?: string[];
  showListening?: (typeof SHOW_LISTENING)[number];
  acceptRequests?: (typeof ACCEPT_REQUESTS)[number];
  emailNews?: boolean;
  autoplaySimilar?: boolean;
  showLyrics?: boolean;
  keepScreenAwake?: boolean;
  /** Marks onboarding finished. Only true is accepted; it cannot be undone. */
  onboarded?: true;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const KEYS = new Set([
  'displayName',
  'language',
  'musicLanguages',
  'favouriteArtists',
  'showListening',
  'acceptRequests',
  'emailNews',
  'autoplaySimilar',
  'showLyrics',
  'keepScreenAwake',
  'onboarded',
]);

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Validates a PATCH /api/me body. Unknown keys are refused so a typo never silently does nothing. */
export function parseProfilePatch(body: unknown): Parsed<ProfilePatch> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, message: 'Send a JSON object.' };
  }
  const input = body as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!KEYS.has(key)) return { ok: false, message: `"${key}" can't be changed here.` };
  }
  const out: ProfilePatch = {};

  if ('displayName' in input) {
    const v = input.displayName;
    if (typeof v !== 'string') return { ok: false, message: 'Display name must be text.' };
    const name = v.trim().replace(/\s+/g, ' ');
    if (name.length < 1 || name.length > 60)
      return { ok: false, message: 'Display name must be 1 to 60 characters.' };
    out.displayName = name;
  }
  if ('language' in input) {
    if (!LANGUAGES.includes(input.language as Language))
      return { ok: false, message: 'Language must be en, pa or hi.' };
    out.language = input.language as Language;
  }
  if ('musicLanguages' in input) {
    const v = input.musicLanguages;
    if (!isStringArray(v) || v.length > 12 || v.some((x) => !MUSIC_LANGUAGE_PATTERN.test(x))) {
      return { ok: false, message: 'Music languages must be up to 12 language codes.' };
    }
    out.musicLanguages = [...new Set(v)];
  }
  if ('favouriteArtists' in input) {
    const v = input.favouriteArtists;
    if (!isStringArray(v) || v.length > 50 || v.some((x) => x.trim().length < 1 || x.length > 80)) {
      return { ok: false, message: 'Favourite artists must be up to 50 names.' };
    }
    out.favouriteArtists = [...new Set(v.map((x) => x.trim()))];
  }
  if ('showListening' in input) {
    if (!SHOW_LISTENING.includes(input.showListening as never))
      return { ok: false, message: 'Show listening must be friends or nobody.' };
    out.showListening = input.showListening as ProfilePatch['showListening'];
  }
  if ('acceptRequests' in input) {
    if (!ACCEPT_REQUESTS.includes(input.acceptRequests as never))
      return { ok: false, message: 'Accept requests must be everyone or nobody.' };
    out.acceptRequests = input.acceptRequests as ProfilePatch['acceptRequests'];
  }
  if ('emailNews' in input) {
    if (typeof input.emailNews !== 'boolean')
      return { ok: false, message: 'Email news must be true or false.' };
    out.emailNews = input.emailNews;
  }
  for (const key of ['autoplaySimilar', 'showLyrics', 'keepScreenAwake'] as const) {
    if (key in input) {
      if (typeof input[key] !== 'boolean')
        return { ok: false, message: `${key} must be true or false.` };
      out[key] = input[key] as boolean;
    }
  }
  if ('onboarded' in input) {
    if (input.onboarded !== true)
      return { ok: false, message: 'Onboarded can only be set to true.' };
    out.onboarded = true;
  }
  if (Object.keys(out).length === 0) return { ok: false, message: 'Nothing to change.' };
  return { ok: true, value: out };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string): boolean => UUID.test(v);

/** Dev is recognised by host: dev.* or localhost. Used for the email allowlist and the DEV bar. */
export function isDevHost(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return (
      host.startsWith('dev.') ||
      host.startsWith('dev-') ||
      host === 'localhost' ||
      host === '127.0.0.1'
    );
  } catch {
    return false;
  }
}
