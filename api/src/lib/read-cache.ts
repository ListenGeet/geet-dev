/**
 * Tiny per-process cache for repeatable public reads. It also coalesces concurrent misses so
 * identical requests share one database round trip. Entries are deliberately short-lived and
 * bounded because API instances may be long-lived and keys can include user search text.
 */
const TTL_MS = 5_000;
const MAX_ENTRIES = 256;

type Entry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const entries = new Map<string, Entry<unknown>>();

export function cachedRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = entries.get(key) as Entry<T> | undefined;
  if (cached && cached.expiresAt > now) {
    // Refresh insertion order for a small LRU bound.
    entries.delete(key);
    entries.set(key, cached);
    return cached.promise;
  }
  if (cached) entries.delete(key);

  const entry: Entry<T> = {
    expiresAt: Number.POSITIVE_INFINITY,
    promise: Promise.resolve(undefined as T),
  };
  entry.promise = Promise.resolve()
    .then(load)
    .then(
      (value) => {
        entry.expiresAt = Date.now() + TTL_MS;
        return value;
      },
      (error: unknown) => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      },
    );
  entries.set(key, entry);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
  return entry.promise;
}
