const CACHE_NAME = 'stockroom-dashboard-v3';

const ASSETS = [
  '/css/theme.css',
  '/css/shared-header.css',
  '/css/dashboard.css',
  '/css/mobile.css',
  '/js/shared-header.js',
  '/js/app-home.js',
  '/images/suitsupply-logo.svg',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Network-first for navigations (HTML) to avoid serving stale authenticated pages
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Network-first for CSS/JS (fast updates), fallback to cache if offline
  if (req.destination === 'style' || req.destination === 'script') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (isSameOrigin && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((resp) => {
      if (!resp.ok) return resp;
      // Don't cache responses that explicitly ask not to be cached.
      const cacheControl = (resp.headers.get('Cache-Control') || '').toLowerCase();
      if (cacheControl.includes('no-store')) return resp;
      const copy = resp.clone();
      if (isSameOrigin) caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
      return resp;
    }))
  );
});
