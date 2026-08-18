import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[SW] Registered with scope:', reg.scope);

        // If a new SW is waiting (e.g. CACHE_NAME was bumped), force it to take over immediately
        const activateWaiting = (sw) => {
          if (sw && sw.state === 'installed') {
            sw.postMessage({ type: 'SKIP_WAITING' });
          }
        };

        if (reg.waiting) {
          activateWaiting(reg.waiting);
        }
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed') {
                activateWaiting(newWorker);
              }
            });
          }
        });
      })
      .catch((err) => {
        console.error('[SW] Registration failed:', err);
      });
  });
}

