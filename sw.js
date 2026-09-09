// Anagnosis service worker.
//
// Strategy:
//  - App shell (this origin): network first, falling back to the cache, so an
//    online visit always gets the newest files and an offline one still works.
//  - Google Fonts and MorphGNT data files: cache first (they never change for
//    a given URL), so the Greek text you have read stays readable offline.

const SHELL_CACHE = 'anagnosis-shell-v2';
const ASSET_CACHE = 'anagnosis-assets-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/books.js',
  './js/greek.js',
  './js/morphgnt.js',
  './js/refs.js',
  './js/parsing.js',
  './js/paradigm.js',
  './js/datasource.js',
  './js/state.js',
  './js/export.js',
  './js/sample.js',
  './js/lexicon.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Cached separately: large, rarely changing, and wanted offline.
const PRECACHED_ASSETS = ['./data/lexicon.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)),
    // Best effort: a missing lexicon must not fail the whole install.
    caches.open(ASSET_CACHE).then((cache) => cache.addAll(PRECACHED_ASSETS)).catch(() => {}),
  ]).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

const isAsset = (url) =>
  url.hostname === 'fonts.googleapis.com' ||
  url.hostname === 'fonts.gstatic.com' ||
  (url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/morphgnt/')) ||
  (url.origin === self.location.origin && url.pathname.includes('/data/'));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (isAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw new Error('offline and not cached');
  }
}
