import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/globals.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('INBOX9 frontend root element is missing');
}

// INBOX9 is an operational web app, not an offline-first PWA. A stale service
// worker can keep an older hashed React bundle alive after a deployment and
// cause route-time errors even while Render/API health is green. Remove any
// previously installed worker and its caches so every deployment uses the
// current Vite build.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.getRegistrations().then((registrations) =>
      Promise.all(registrations.map((registration) => registration.unregister())),
    ).then(() => {
      if (!('caches' in window)) return;
      return caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('inbox9-shell-')).map((key) => caches.delete(key)),
      ));
    }).catch(() => {
      // Cache cleanup is defensive; the application remains usable without it.
    });
  });
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
