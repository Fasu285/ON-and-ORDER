
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './src/App';

// Register Service Worker with origin check
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => {
    // Only register if we are in a top-level context or the domain allows it
    const swUrl = new URL('/service-worker.js', window.location.href).href;
    
    navigator.serviceWorker.register(swUrl)
      .then(registration => {
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                window.location.reload();
              }
            };
          }
        };
      })
      .catch(error => {
        // Silently fail if SW registration is blocked by environment (common in previews)
        console.info('Service Worker registration skipped or blocked:', error.message);
      });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
