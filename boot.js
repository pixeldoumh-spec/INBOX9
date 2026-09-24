(() => {
  const app = document.getElementById('app');
  const scriptTag = document.currentScript;
  const appScript = scriptTag?.dataset?.appScript || '/app.js';
  let started = false;
  let settled = false;

  const showError = (message) => {
    if (!app || settled) return;
    settled = true;
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '<div class="boot-loader boot-error" role="alert"><div class="boot-loader-inner"><div class="boot-loader-text">' + message + '</div></div></div>';
  };

  const timeout = window.setTimeout(() => {
    if (!started) showError('The application is taking too long to start. Please reload the page.');
  }, 10000);

  window.addEventListener('error', (event) => {
    if (!started) {
      const message = event?.error?.message || event?.message || 'The application could not be started.';
      showError(message);
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (!started) showError(event?.reason?.message || 'The application could not be started.');
  });

  const script = document.createElement('script');
  script.src = appScript + '?v=' + Date.now();
  script.type = 'module';
  script.onload = () => {
    started = true;
    settled = true;
    window.clearTimeout(timeout);
    app?.setAttribute('aria-busy', 'false');
  };
  script.onerror = () => {
    window.clearTimeout(timeout);
    showError('The application bundle could not be loaded. Please reload the page.');
  };
  document.head.appendChild(script);
})();
