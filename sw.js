// Service Worker for Pair2Peer
const CACHE_VERSION = '2.2.5';
const CACHE_NAME = `pair2peer-v${CACHE_VERSION}`;
const urlsToCache = [
  './',
  './index.html',
  './version.js',
  './sdp-compact.js',
  './asn1-uper-codec.js',
  './binary-codec.js',
  './crc.js',
  './base45-lib.js',
  './manifest.json',
  './favicon.ico'
];

// Install event - cache assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker version:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        // Don't add cache busting params - let browser handle it
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] Install completed, skip waiting');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Install failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker version:', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName.startsWith('pair2peer-') && cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete, claiming clients');
        return self.clients.claim();
      })
      .catch(error => {
        console.error('[SW] Activation failed:', error);
      })
  );
});

// Fetch event - network first for HTML, cache first for assets
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Skip chrome-extension and other non-http protocols
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Network-first strategy for HTML documents
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful responses
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache for offline
          return caches.match(request);
        })
    );
    return;
  }

  // Cache-first strategy for assets
  event.respondWith(
    caches.match(request)
      .then(response => {
        if (response) {
          // Return cached version
          return response;
        }

        // Fetch from network
        return fetch(request).then(networkResponse => {
          // Cache successful responses
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
      .catch(error => {
        console.error('[SW] Fetch failed:', error);
        // For images, return a placeholder or just fail silently
        if (request.destination === 'image') {
          return new Response('', { status: 404 });
        }
      })
  );
});

// Listen for messages from the client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Skip waiting received');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

// Handle service worker updates
self.addEventListener('updatefound', () => {
  console.log('[SW] Update found!');
});

// Log errors
self.addEventListener('error', event => {
  console.error('[SW] Error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[SW] Unhandled rejection:', event.reason);
});