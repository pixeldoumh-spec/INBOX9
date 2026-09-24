(() => {
  const app = document.getElementById('app');
  const scriptTag = document.currentScript;
  const appScript = scriptTag?.dataset?.appScript || '/app.js';
  let started = false;

  const showError = (message) => {
    if (!app) return;
    app.innerHTML = `<div class="boot-fallback boot-error" role="alert">${message}</div>`;
  };

  const timeout = window.setTimeout(() => {
    if (!started && app?.querySelector('.boot-fallback')) {
      showError('INBOX9 could not start. Please reload the page.');
    }
  }, 10000);

  const script = document.createElement('script');
  script.src = `${appScript}?v=${Date.now()}`;
  script.type = 'module';
  script.defer = false;
  script.onload = () => {
    started = true;
    window.clearTimeout(timeout);
  };
  script.onerror = () => {
    started = true;
    window.clearTimeout(timeout);
    showError('INBOX9 application bundle could not be loaded. Please reload the page.');
  };
  document.head.appendChild(script);
})();
