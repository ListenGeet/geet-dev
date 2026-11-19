/** Short commit on Vercel, otherwise the package version. Never anything secret. */
export function appVersion(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : (process.env.npm_package_version ?? '0.0.0');
}
