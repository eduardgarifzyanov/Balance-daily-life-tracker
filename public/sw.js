const CACHE = 'balance-v6';
const ASSETS = ['/', '/style.css', '/app.js', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('balance-v') && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const asset = event.request.mode === 'navigate' ? '/' : url.pathname;
  if (url.pathname.startsWith('/api/') || !ASSETS.includes(asset)) return;
  event.respondWith(fetch(event.request).catch(async () =>
    (await (await caches.open(CACHE)).match(asset)) || Response.error()));
});

