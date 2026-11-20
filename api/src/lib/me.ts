import {
  normalizeUsername,
  usernameProblem,
  USERNAME_COOLDOWN_DAYS,
  USERNAME_PROBLEM_TEXT,
  type MeDto,
  type ProfilePatch,
  type UsernameAvailability,
} from '@geet/shared';
import { fetchPerson, roleFor } from './clerk';
import * as repo from './repo';
import type { ProfileRow } from './repo';

/** The signed-in person's profile; created with its identity on the first call (docs/15). */
export async function loadOrCreateProfile(sub: string): Promise<ProfileRow> {
  const existing = await repo.profileBySubject(sub);
  if (existing) return existing;
  const person = await fetchPerson(sub);
  return repo.ensureProfile(sub, person.displayName, person.avatarUrl, roleFor(person));
}

export function usernameChangeableAt(
  row: Pick<ProfileRow, 'username' | 'username_changed_at'>,
  now = new Date(),
): string | null {
  if (!row.username || !row.username_changed_at) return null;
  const at = new Date(
    new Date(row.username_changed_at).getTime() + USERNAME_COOLDOWN_DAYS * 86_400_000,
  );
  return at > now ? at.toISOString() : null;
}

export function toMe(row: ProfileRow, counts: MeDto['counts']): MeDto {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    language: row.language,
    musicLanguages: row.music_languages,
    favouriteArtists: row.favourite_artists,
    showListening: row.show_listening,
    acceptRequests: row.accept_requests,
    emailNews: row.email_news,
    onboarded: row.onboarded_at !== null,
    usernameChangeableAt: usernameChangeableAt(row),
    counts,
  };
}

/** Maps the validated patch to columns. The consent time is stamped whenever the news choice changes. */
export function patchToColumns(
  row: ProfileRow,
  patch: ProfilePatch,
  now = new Date(),
): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (patch.displayName !== undefined) c.display_name = patch.displayName;
  if (patch.language !== undefined) c.language = patch.language;
  if (patch.musicLanguages !== undefined) c.music_languages = patch.musicLanguages;
  if (patch.favouriteArtists !== undefined) c.favourite_artists = patch.favouriteArtists;
  if (patch.showListening !== undefined) c.show_listening = patch.showListening;
  if (patch.acceptRequests !== undefined) c.accept_requests = patch.acceptRequests;
  if (patch.emailNews !== undefined && patch.emailNews !== row.email_news) {
    c.email_news = patch.emailNews;
    c.email_news_at = now.toISOString();
  }
  if (patch.onboarded && row.onboarded_at === null) c.onboarded_at = now.toISOString();
  return c;
}

export type UsernameResult = { ok: true; username: string } | { ok: false; message: string };

/** Sets or changes the username: format, availability, and one change per 30 days (docs/05, docs/15). */
export async function setUsername(
  row: ProfileRow,
  raw: string,
  now = new Date(),
): Promise<UsernameResult> {
  const name = normalizeUsername(raw);
  const problem = usernameProblem(name);
  if (problem) return { ok: false, message: USERNAME_PROBLEM_TEXT[problem] };
  if (row.username === name) return { ok: true, username: name };

  const until = usernameChangeableAt(row, now);
  if (until)
    return {
      ok: false,
      message: `You changed your username recently. You can change it again on ${until.slice(0, 10)}.`,
    };

  const saved = await repo.writeUsername(row.id, name, row.username !== null);
  if (!saved) return { ok: false, message: `@${name} is taken.` };
  return { ok: true, username: name };
}

export async function checkAvailability(
  row: ProfileRow,
  raw: string,
): Promise<UsernameAvailability> {
  const name = normalizeUsername(raw);
  const problem = usernameProblem(name);
  if (problem) return { name, available: false, yours: false, problem };
  if (row.username === name) return { name, available: true, yours: true, problem: null };
  const owner = await repo.usernameOwner(name);
  return { name, available: owner === null, yours: false, problem: null };
}
