const CACHE_NAME = 'labtest-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.json'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching static shell');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Exclude Supabase API and Localhost HMR from cache
  if (
    e.request.method !== 'GET' ||
    url.pathname.startsWith('/api') ||
    url.host.includes('supabase') ||
    url.host.includes('qdrant') ||
    url.host.includes('hot-update')
  ) {
    return;
  }

  // Check if CDN assets (Plotly, Mermaid, Google Fonts, Hugging Face models) - Cache First Strategy
  const isCDN = url.host.includes('cdn.plot.ly') || 
                url.host.includes('cdn.jsdelivr.net') || 
                url.host.includes('fonts.googleapis.com') || 
                url.host.includes('fonts.gstatic.com') ||
                url.host.includes('huggingface.co');

  if (isCDN) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(e.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
          return networkResponse;
        }).catch(() => cachedResponse || new Response('Offline', { status: 503, statusText: 'Service Unavailable' }));
      })
    );
    return;
  }

  // Same-origin App code - Network First (falling back to cache, then to index.html for React SPA routing)
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // Cache dynamic static assets on the fly
        if (
          networkResponse && 
          networkResponse.status === 200 && 
          (url.origin === self.location.origin) &&
          (url.pathname.includes('.js') || url.pathname.includes('.css') || url.pathname.includes('.png') || url.pathname.includes('.svg'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback strategy: return cached item or index.html for client routing
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          
          // For HTML/navigation requests, return root index.html
          if (e.request.mode === 'navigate' || (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html'))) {
            return caches.match('/index.html');
          }
          
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});
