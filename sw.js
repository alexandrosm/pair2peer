// Service Worker for Pair2Peer
const CACHE_NAME = 'pair2peer-v2.0.0-local';
const urlsToCache = [
  './',
  './index.html',
  './version.js',
  './sdp-compact.js',
  './asn1-uper-codec.js',
  './binary-codec.js',
  './crc.js'
];

// Install event - cache assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache.map(url => {
          // For local files, add cache bust parameter
          if (url.startsWith('/') && url !== '/') {
            return url.includes('?') ? url : url + '?v=' + Date.now();
          }
          return url;
        }));
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith('pair2peer-') && cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control immediately
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true })
      .then(response => {
        if (response) {
          console.log('[SW] Serving from cache:', request.url);
          // Check for updates in the background
          fetch(request).then(networkResponse => {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, networkResponse);
            });
          }).catch(() => {});
          return response;
        }

        console.log('[SW] Fetching from network:', request.url);
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
        // Return offline page if available
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
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
  
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    // Force check for updates
    fetch('./version-info.json?t=' + Date.now())
      .then(response => response.json())
      .then(info => {
        event.ports[0].postMessage({ type: 'VERSION_INFO', data: info });
      })
      .catch(error => {
        event.ports[0].postMessage({ type: 'ERROR', error: error.message });
      });
  }
});