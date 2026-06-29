// ReadMaxx Free service worker — offline-first PWA shell
const VERSION = 'readmaxx-v1';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/fonts.css',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/rsvp.js',
  './js/ui.js',
  './assets/icon.svg',
  './assets/fonts/lexend-var.woff2',
  './assets/fonts/atkinson-400.woff2',
  './assets/fonts/atkinson-700.woff2',
  './assets/fonts/opendyslexic-400.woff2',
  './assets/fonts/opendyslexic-700.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './vendor/jszip.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) =>
      // Add individually so one 404 (e.g. an optional vendor file) can't abort the whole install.
      Promise.allSettled(CORE.map((u) => c.add(u)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache cross-origin reader/proxy calls (URL import) — always go to network.
  if (url.origin !== self.location.origin) return;

  // Navigation requests: serve the cached app shell (SPA) so offline launch works.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Same-origin assets: cache-first, then network, then cache the result.
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => hit)
    )
  );
});
