import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 1. FORCE CLEAR ALL SERVICE WORKERS (Nuclear Reset)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (let registration of registrations) {
      registration.unregister();
    }
  }).catch(err => console.log('SW clear failed:', err));
}

// 2. CLEAR CACHE STORAGE
if ('caches' in window) {
  caches.keys().then((names) => {
    for (let name of names) caches.delete(name);
  });
}

// 3. RENDER THE APP
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}