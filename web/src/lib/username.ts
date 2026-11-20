import { normalizeUsername, usernameProblem, USERNAME_PROBLEM_TEXT } from '@geet/shared';

/** Turns a Clerk name or email into a first guess for the username field: lowercase, allowed characters only. */
export function suggestUsername(source: string | null | undefined): string {
  if (!source) return '';
  const guess = normalizeUsername(source.normalize('NFKD'))
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 20);
  return guess;
}

/** The hint under the field before the server is asked. Null means the shape is fine. */
export function localUsernameHint(name: string): string | null {
  if (name === '') return null;
  const problem = usernameProblem(name);
  return problem ? USERNAME_PROBLEM_TEXT[problem] : null;
}
