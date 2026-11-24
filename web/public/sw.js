/* Geet service worker: offline audio (with Range support), covers, lyrics, pages and static assets.
   Goal: the app looks and works the same offline as online, using whatever was cached while online. */
const AUDIO = 'geet-audio-v1';       // saved songs (also written by src/lib/offline.ts)
const COVERS = 'geet-covers-v1';     // artwork of saved songs (also written by src/lib/offline.ts)
const SHELL = 'geet-shell-v4';       // static assets
const PAGES = 'geet-pages-v2';       // HTML of pages the person has visited
const DATA = 'geet-data-v1';         // small API responses that are safe to reuse offline (lyrics)
const KEEP = [AUDIO, COVERS, SHELL, PAGES, DATA];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll([
    '/offline.html', '/brand/geet-wordmark-white.png', '/brand/geet-wordmark-white-bars.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png',
    '/icons/shortcut-search-96.png', '/icons/shortcut-library-96.png', '/icons/shortcut-offline-96.png',
    '/illustrations/offline.svg', '/illustrations/cover-fallback.svg', '/illustrations/no-downloads.svg',
    '/illustrations/no-results.svg', '/illustrations/error.svg',
  ])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));

async function serveOfflineAudio(req, id) {
  const cache = await caches.open(AUDIO);
  const res = await cache.match('/offline-audio/' + id);
  if (!res) return new Response('Not saved on this device', { status: 404 });
  const buf = await res.arrayBuffer();
  const base = { 'Content-Type': 'audio/mp4', 'Accept-Ranges': 'bytes' };
  const range = req.headers.get('range');
  if (!range) return new Response(buf, { status: 200, headers: { ...base, 'Content-Length': String(buf.byteLength) } });
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const start = m && m[1] ? parseInt(m[1], 10) : 0;
  const end = Math.min(m && m[2] ? parseInt(m[2], 10) : buf.byteLength - 1, buf.byteLength - 1);
  if (start > end) return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + buf.byteLength } });
  const part = buf.slice(start, end + 1);
  return new Response(part, { status: 206, headers: { ...base, 'Content-Length': String(part.byteLength), 'Content-Range': `bytes ${start}-${end}/${buf.byteLength}` } });
}

/** Network first (so pages are always fresh online); fall back to the last copy we stored. */
async function networkFirst(req, cacheName, timeoutMs, key) {
  const cache = await caches.open(cacheName);
  const k = key || req;
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), timeoutMs)),
    ]);
    if (res && res.ok && !res.redirected) cache.put(k, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(k, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/offline-audio/')) { e.respondWith(serveOfflineAudio(req, url.pathname.split('/').pop())); return; }

  // Pages: same HTML offline as online for pages already visited; anything else gets the plain offline notice.
  const wantsHtml = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (wantsHtml && !req.headers.get('rsc')) {
    e.respondWith((async () => {
      try { return await networkFirst(req, PAGES, 4000, url.pathname); }
      catch {
        const cache = await caches.open(PAGES);
        return (await cache.match(url.pathname, { ignoreVary: true })) || (await caches.match('/offline.html'));
      }
    })());
    return;
  }

  // Artwork: saved songs keep their cover; others are cached as they are seen.
  if (url.pathname.startsWith('/api/cover/')) {
    e.respondWith((async () => {
      const saved = await (await caches.open(COVERS)).match(url.pathname);
      if (saved) return saved;
      try { return await networkFirst(req, SHELL, 6000); } catch { return new Response('', { status: 404 }); }
    })());
    return;
  }

  // Lyrics are small and static: reuse the last copy when offline.
  if (url.pathname.startsWith('/api/lyrics/')) {
    e.respondWith(networkFirst(req, DATA, 5000).catch(() => new Response(JSON.stringify({ lyrics: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Next.js static files, fonts and icons never change for a given URL: cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/brand/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/illustrations/')) {
    e.respondWith(caches.open(SHELL).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
  }
});

self.addEventListener('push', (e) => {
  if (!e.data) return;
  try {
    const payload = e.data.json();
    const title = payload.title || 'Geet';
    const options = {
      body: payload.body || '',
      icon: payload.icon || '/icons/icon-192.png',
      badge: payload.badge || '/icons/icon-192.png',
      data: payload.data || {},
      tag: payload.tag || undefined,
    };
    e.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    const text = e.data.text();
    e.waitUntil(self.registration.showNotification('Geet', { body: text, icon: '/icons/icon-192.png' }));
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/friends';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
