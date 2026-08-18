const CACHE_NAME = 'labtest-cache-v2'; // bumped to force SW update
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.json'
];

// Install: cache static assets and immediately take control
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting()) // activate new SW without waiting for old clients to close
  );
});

// Activate: purge old caches and claim all open clients immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim()) // take control of all pages immediately
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

  // CDN assets — Cache First Strategy
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
          if (!networkResponse || networkResponse.status !== 200) return networkResponse;
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
          return networkResponse;
        }).catch(() => cachedResponse || new Response('Offline', { status: 503 }));
      })
    );
    return;
  }

  // Same-origin — Network First, falling back to cache / index.html for SPA routing
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          url.origin === self.location.origin &&
          (url.pathname.includes('.js') || url.pathname.includes('.css') ||
           url.pathname.includes('.png') || url.pathname.includes('.svg'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (
            e.request.mode === 'navigate' ||
            (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html'))
          ) {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// ─── Quiz Reminder Notifications ─────────────────────────────────────────────
// SW timers run in a separate thread — NOT throttled on mobile/backgrounded tabs.
// The page posts SCHEDULE_REMINDER with an absolute fireAt timestamp;
// the SW fires showNotification exactly on time regardless of page state.

const reminderTimers = {};

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  // Allow the page to force-activate a waiting SW (used on SW update)
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'SCHEDULE_REMINDER') {
    const { quizId, quizTitle, fireAt } = data;

    // Cancel any existing timer for this quiz
    if (reminderTimers[quizId]) {
      clearTimeout(reminderTimers[quizId]);
      delete reminderTimers[quizId];
    }

    const delay = Math.max(0, fireAt - Date.now());
    console.log(`[SW] Scheduling reminder for quiz ${quizId} in ${Math.round(delay / 1000)}s`);

    reminderTimers[quizId] = setTimeout(async () => {
      delete reminderTimers[quizId];
      try {
        await self.registration.showNotification('⏰ LabTest: незавершённый тест!', {
          body: `Вы проходите тест «${quizTitle}». Нажмите, чтобы вернуться к выполнению!`,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `quiz_reminder_${quizId}`,
          renotify: true,
          requireInteraction: false,
          data: { url: `/quiz/${quizId}` }
        });
        console.log(`[SW] Reminder sent for quiz ${quizId}`);
      } catch (err) {
        console.warn('[SW] Failed to show reminder notification:', err);
      }
    }, delay);
    return;
  }

  if (data.type === 'CLEAR_REMINDER') {
    const { quizId } = data;
    if (reminderTimers[quizId]) {
      clearTimeout(reminderTimers[quizId]);
      delete reminderTimers[quizId];
      console.log(`[SW] Cleared reminder for quiz ${quizId}`);
    }
    return;
  }
});

// Handle notification click — open or focus the correct quiz tab
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Try to focus an already-open tab at the target URL
        for (const client of clients) {
          if (new URL(client.url).pathname === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new tab
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
