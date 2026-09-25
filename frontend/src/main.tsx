import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/globals.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('INBOX9 frontend root element is missing');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker is an enhancement; the app remains fully usable without it.
    });
  });
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
