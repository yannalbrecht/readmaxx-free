// ReadMaxx Free service worker — offline-first PWA shell
// Bump BUILD on every deploy so clients detect a waiting update and can apply it
// from the in-app "Update" button (without reinstalling — data is untouched).
const BUILD = '1.5.0';
const VERSION = 'readmaxx-' + BUILD;
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
    )
    // NOTE: no skipWaiting() here — a new SW stays "waiting" so the app can show
    // an Update button and the user applies it when ready (no surprise reloads).
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// The page posts this when the user taps "Update" — activate the waiting SW now.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache cross-origin reader/proxy calls (URL import) — always go to network.
  if (url.origin !== self.location.origin) return;

  // App code (HTML / JS / CSS / manifest) → NETWORK-FIRST so new deploys show up
  // immediately when online; fall back to cache offline. Without this, cache-first
  // would pin users to a stale build until the SW version changed.
  const isCode = req.mode === 'navigate' ||
    /\.(?:js|mjs|css|webmanifest)$/.test(url.pathname);
  if (isCode) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Immutable assets (fonts / icons / images / vendor) → cache-first for speed.
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
