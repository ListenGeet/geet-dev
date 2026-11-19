import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pub = resolve(process.cwd(), 'public');
const sw = readFileSync(resolve(pub, 'sw.js'), 'utf8');
const install = sw.slice(
  sw.indexOf("addEventListener('install'"),
  sw.indexOf("addEventListener('activate'"),
);
const precached = [...install.matchAll(/'(\/[^']+)'/g)].map((m) => m[1] as string);

describe('sw.js', () => {
  it('uses the v4 shell cache and keeps the other cache names', () => {
    expect(sw).toContain("const SHELL = 'geet-shell-v4'");
    expect(sw).not.toContain('geet-shell-v3');
    for (const n of ['geet-audio-v1', 'geet-covers-v1', 'geet-pages-v2', 'geet-data-v1'])
      expect(sw).toContain(n);
  });

  it('precaches both white wordmarks', () => {
    expect(precached).toContain('/brand/geet-wordmark-white.png');
    expect(precached).toContain('/brand/geet-wordmark-white-bars.png');
  });

  it('precaches only files that exist, or install fails', () => {
    expect(precached.length).toBeGreaterThan(10);
    for (const path of precached) expect(existsSync(resolve(pub, path.slice(1))), path).toBe(true);
  });

  it('serves /brand/ cache-first like /icons/', () => {
    expect(sw).toContain("url.pathname.startsWith('/brand/')");
  });

  it('falls back to /offline.html and not to the home page shell', () => {
    expect(sw).toContain("caches.match('/offline.html')");
    expect(sw).not.toContain("cache.match('/'");
  });
});
