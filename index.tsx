import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './src/App';

// Register Service Worker with origin check to prevent fatal error in sandboxed environments
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => {
    const swUrl = new URL('./service-worker.js', window.location.origin).href;
    navigator.serviceWorker.register(swUrl).then(registration => {
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
    }).catch(err => {
      console.info('Service worker registration skipped:', err.message);
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