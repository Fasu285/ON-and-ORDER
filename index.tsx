import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './src/App';

/**
 * Service Worker Management
 * Consolidates cleanup and registration into a single safe execution flow.
 * Uses window 'load' event to ensure the document is in a valid state for SW operations.
 */
const manageServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    try {
      // 1. Check for old workers and clean up if this is a fresh session in a potential conflict environment
      const swCleanedKey = 'sw_cleanup_v1.3';
      const hasCleaned = sessionStorage.getItem(swCleanedKey);

      if (!hasCleaned) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          if (registrations.length > 0) {
            Promise.all(registrations.map(r => r.unregister())).then(() => {
              sessionStorage.setItem(swCleanedKey, 'true');
              console.log('Old Service Workers cleared.');
              window.location.reload();
            });
          } else {
            sessionStorage.setItem(swCleanedKey, 'true');
          }
        }).catch(err => {
          console.debug('SW registration lookup skipped or failed (expected in some sandboxes):', err.message);
        });
      }

      // 2. Register current worker with relative path to avoid origin mismatch
      // Scope is set to './' to allow the service worker to control pages in this directory and subdirectories
      navigator.serviceWorker.register('./service-worker.js', { scope: './' })
        .then(registration => {
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('New update available. Refresh to apply.');
                }
              };
            }
          };
        })
        .catch(error => {
          console.debug('Service Worker registration deferred or failed:', error.message);
        });
    } catch (e) {
      console.debug('SW management encountered an error:', e);
    }
  });
};

// Initialize SW management
manageServiceWorker();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Root element not found");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);