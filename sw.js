// Offline support: serve the app from cache, refresh the cache on each release.
// Bump VERSION whenever any file changes so phones pick up the new build.
const VERSION = 'lift-1.0.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/screens.css',
  './js/main.js',
  './js/store.js',
  './js/seed.js',
  './js/fmt.js',
  './js/logic.js',
  './js/ui.js',
  './js/sheets.js',
  './js/nav.js',
  './js/charts.js',
  './js/views/today.js',
  './js/views/workout.js',
  './js/views/session.js',
  './js/views/history.js',
  './js/views/progress.js',
  './js/views/program.js',
  './js/views/picker.js',
  './js/views/settings.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.svg',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, which could still hold the previous release.
  const fresh = ASSETS.map((u) => new Request(u, { cache: 'reload' }));
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
