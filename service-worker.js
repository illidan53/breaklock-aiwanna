// Cache version and file list are derived from the exact deployed build.
const CACHE_PREFIX = 'breaklock-aiwanna-';
const CACHE_NAME = CACHE_PREFIX + '__CACHE_VERSION__';
const FILES = __PRECACHE_FILES__;
const cacheable = new Set(FILES.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names
    .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
    .map(name => caches.delete(name))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  url.search = '';
  url.hash = '';
  if (url.pathname.endsWith('/')) url.pathname += 'index.html';
  if (!cacheable.has(url.href)) return;

  // Prefer current releases online; fall back to the matching language offline.
  event.respondWith(fetch(event.request).then(async response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(url.href, copy);
      } catch (_) { /* Storage limits must not block an online response. */ }
    }
    return response;
  }).catch(async error => {
    const cached = await caches.match(url.href);
    if (cached) return cached;
    throw error;
  }));
});
