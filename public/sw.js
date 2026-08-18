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

// ─── Quiz Reminder Notifications ─────────────────────────────────────────────
// SW timers are NOT throttled by the browser like page-level setTimeout,
// so this fires accurately even when the tab is backgrounded or the app is minimized.

const reminderTimers = {};

self.addEventListener('message', (event) => {
  const { type, quizId, quizTitle, fireAt } = event.data || {};

  if (type === 'SCHEDULE_REMINDER') {
    // Cancel any existing timer for this quiz
    if (reminderTimers[quizId]) {
      clearTimeout(reminderTimers[quizId]);
      delete reminderTimers[quizId];
    }

    const delay = Math.max(0, fireAt - Date.now());

    reminderTimers[quizId] = setTimeout(async () => {
      delete reminderTimers[quizId];
      try {
        await self.registration.showNotification('⏰ LabTest: незавершенный тест!', {
          body: `Вы проходите тест «${quizTitle}». Нажмите, чтобы вернуться к выполнению!`,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `quiz_reminder_${quizId}`,
          renotify: true,
          data: { url: `/quiz/${quizId}` }
        });
      } catch (err) {
        console.warn('[SW] Failed to show reminder notification:', err);
      }
    }, delay);
    return;
  }

  if (type === 'CLEAR_REMINDER') {
    if (reminderTimers[quizId]) {
      clearTimeout(reminderTimers[quizId]);
      delete reminderTimers[quizId];
    }
    return;
  }
});

// Handle notification click — open/focus the quiz tab
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
