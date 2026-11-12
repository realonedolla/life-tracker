// Service Worker: hält die App-Dateien offline vor. Daten liegen in IndexedDB, nicht hier.
// VERSION bei jeder Veröffentlichung erhöhen, damit das iPhone die neuen Dateien lädt.

const VERSION = 'v9-1';
const CACHE = `lt-${VERSION}`;
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fonts/silkscreen-400.woff2',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/vendor/preact-htm.js',
  './js/app.js',
  './js/db.js',
  './js/time.js',
  './js/model.js',
  './js/seed.js',
  './js/migrate.js',
  './js/config.js',
  './js/sync.js',
  './js/photos.js',
  './js/zip.js',
  './js/backup.js',
  './js/ui.js',
  './js/views/data.js',
  './js/views/world.js',
  './js/views/today.js',
  './js/views/session.js',
  './js/views/goal.js',
  './js/views/calendar.js',
  './js/views/ideas.js',
  './js/sun.js',
  './js/pixel.js',
  './js/scene.js',
  './js/garden.js',
  './js/reminders.js',
  './js/views/reminders.js',
  './js/views/setup.js',
  './js/views/friends.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lt-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((r) => r || fetch(request)));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((r) => r || fetch(request)));
});
