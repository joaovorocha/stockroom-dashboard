const CACHE_NAME = 'stockroom-dashboard-v4';
const OFFLINE_URL = '/offline.html';
const API_CACHE = 'stockroom-api-v1';
const IMAGE_CACHE = 'stockroom-images-v1';

const CRITICAL_ASSETS = [
  '/',
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
  '/icons/icon-512.png',
  '/offline.html'
];

const API_ENDPOINTS = [
  '/api/gameplan',
  '/api/shipments',
  '/api/lost-punch',
  '/api/store'
];

// Install event - cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching critical assets for offline support');
        return cache.addAll(CRITICAL_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.error('Cache installation failed:', err);
        // Continue even if some assets fail
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        console.log('Cleaning up old caches');
        return Promise.all(
          keys
            .filter(k => k !== CACHE_NAME && k !== API_CACHE && k !== IMAGE_CACHE)
            .map(k => caches.delete(k))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(
      // Attempt to sync pending changes when back online
      fetch('/api/sync', { method: 'POST' })
        .then(resp => resp.json())
        .catch(() => {
          // Still offline, will retry on next sync
          console.log('Sync failed, will retry when online');
        })
    );
  }
});

// Fetch event - intelligent caching strategies
self.addEventListener('fetch', (event) => {
  const req = event.request;
  
  // Skip non-GET requests
  if (req.method !== 'GET') {
    // Queue POST requests for sync when offline
    if (req.method === 'POST' && navigator.onLine === false) {
      event.respondWith(
        new Promise((resolve, reject) => {
          self.registration.sync.register('sync-data').catch(() => {});
          reject(new Error('Offline - will sync when online'));
        })
      );
    }
    return;
  }

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Strategy 1: Network-first for API calls (with cache fallback)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp.ok && isSameOrigin) {
            const copy = resp.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(req, copy);
              // Limit API cache to 50 items
              cache.keys().then(keys => {
                if (keys.length > 50) cache.delete(keys[0]);
              });
            }).catch(() => {});
          }
          return resp;
        })
        .catch(() => {
          // Return cached API response if offline
          return caches.match(req).then(cached => {
            return cached || new Response(
              JSON.stringify({ error: 'Offline', cached: true }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Strategy 2: Network-first for HTML/documents (avoid stale auth pages)
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp.ok && isSameOrigin) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => {
          // Return cached page or offline page
          return caches.match(req)
            .then(cached => cached || caches.match(OFFLINE_URL))
            .catch(() => new Response('Offline', { status: 503 }));
        })
    );
    return;
  }

  // Strategy 3: Stale-while-revalidate for CSS/JS (serve cache immediately, update in background)
  if (req.destination === 'style' || req.destination === 'script') {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((resp) => {
          if (resp.ok && isSameOrigin) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return resp;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Strategy 4: Cache-first for images (serve from cache, update if fresh copy available)
  if (req.destination === 'image') {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          // Update cache in background
          fetch(req)
            .then(resp => {
              if (resp.ok && isSameOrigin) {
                const copy = resp.clone();
                caches.open(IMAGE_CACHE).then(cache => {
                  cache.put(req, copy);
                  // Limit image cache to 100 items
                  cache.keys().then(keys => {
                    if (keys.length > 100) cache.delete(keys[0]);
                  });
                }).catch(() => {});
              }
            })
            .catch(() => {});
          return cached;
        }
        
        return fetch(req).then((resp) => {
          if (!resp.ok) return resp;
          const cacheControl = (resp.headers.get('Cache-Control') || '').toLowerCase();
          if (cacheControl.includes('no-store')) return resp;
          
          const copy = resp.clone();
          if (isSameOrigin) {
            caches.open(IMAGE_CACHE).then(cache => {
              cache.put(req, copy);
              cache.keys().then(keys => {
                if (keys.length > 100) cache.delete(keys[0]);
              });
            }).catch(() => {});
          }
          return resp;
        }).catch(() => {
          // Return placeholder for missing images
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#f0f0f0" width="100" height="100"/></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        });
      })
    );
    return;
  }

  // Strategy 5: Cache-first for all other assets
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((resp) => {
        if (!resp.ok) return resp;
        const cacheControl = (resp.headers.get('Cache-Control') || '').toLowerCase();
        if (cacheControl.includes('no-store')) return resp;
        
        const copy = resp.clone();
        if (isSameOrigin) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(req, copy);
          }).catch(() => {});
        }
        return resp;
      });
    })
  );
});
