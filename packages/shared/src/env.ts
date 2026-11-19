export type EnvSource = Record<string, string | undefined>;

export interface EnvRule {
  name: string;
  /** Minimum length, for secrets. */
  minLength?: number;
  /** Extra check. Return an error message, or null when the value is fine. */
  check?: (value: string) => string | null;
}

const isUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? null : 'must be an http(s) URL';
  } catch {
    return 'must be a URL';
  }
};

const origins = (v: string) => {
  const parts = v.split(',').map((s) => s.trim());
  if (parts.some((p) => p === '')) return 'must be a comma separated list of origins';
  for (const p of parts) if (isUrl(p) !== null) return `"${p}" is not a valid origin`;
  return null;
};

/** Required variables per app, from docs/12. Only what exists so far; each phase adds its own. */
export const webEnv: EnvRule[] = [
  { name: 'NEXT_PUBLIC_APP_URL', check: isUrl },
  { name: 'NEXT_PUBLIC_API_URL', check: isUrl },
];

export const apiEnv: EnvRule[] = [
  { name: 'NEXT_PUBLIC_APP_URL', check: isUrl },
  { name: 'CORS_ORIGINS', check: origins },
];

/** Returns one message per problem. Never includes the value itself. */
export function validateEnv(rules: EnvRule[], env: EnvSource): string[] {
  const problems: string[] = [];
  for (const rule of rules) {
    const value = env[rule.name];
    if (value === undefined || value === '') {
      problems.push(`${rule.name} is missing`);
      continue;
    }
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      problems.push(`${rule.name} must be at least ${rule.minLength} characters`);
      continue;
    }
    const msg = rule.check?.(value);
    if (msg) problems.push(`${rule.name} ${msg}`);
  }
  return problems;
}

/**
 * Throws when REQUIRE_ENV=1 and something is missing (the build fails).
 * Otherwise logs one line per problem and returns false (the request fails, see requireEnvAtRequest).
 */
export function assertEnv(app: string, rules: EnvRule[], env: EnvSource): boolean {
  const problems = validateEnv(rules, env);
  if (problems.length === 0) return true;
  const message = `[${app}] environment: ${problems.join('; ')}`;
  if (env.REQUIRE_ENV === '1') throw new Error(message);
  console.error(message);
  return false;
}
