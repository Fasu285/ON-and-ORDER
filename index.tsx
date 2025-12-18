// Add this at the VERY TOP of index.tsx
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (let registration of registrations) {
      registration.unregister().then(() => {
        console.log('Old Service Worker nuked');
        // Only reload if we actually found and unregistered a worker
        window.location.reload(); 
      });
    }
  });
}

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

  if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(registration => {
      // Check for updates automatically
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker) {
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content is available; force a refresh
              window.location.reload();
            }
          };
        }
      };
    });
  });
}

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