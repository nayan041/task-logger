// Service worker — caches the app shell for offline open. Network-only for
// GitHub API and raw content (data must always be fresh).
const VERSION = 'tasklog-v4';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './github.js',
  './markdown.js',
  './search.js',
  './db.js',
  './manifest.webmanifest',
  './vendor/marked.min.js',
  './vendor/purify.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache GitHub API or raw responses.
  if (url.host === 'api.github.com' || url.host.endsWith('githubusercontent.com')) {
    return; // default network behavior
  }
  if (e.request.method !== 'GET') return;
  // Same-origin shell: cache-first, falling back to network.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html')))
    );
  }
});
