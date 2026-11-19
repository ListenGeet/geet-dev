/** Dev is recognised by its host (dev.listengeet.com). Shows the DEV bar and sets noindex (docs/12). */
export function isDevSite(appUrl: string | undefined): boolean {
  if (!appUrl) return false;
  try {
    return new URL(appUrl).hostname.startsWith('dev.');
  } catch {
    return false;
  }
}
