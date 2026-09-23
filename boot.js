window.setTimeout(() => {
  const app = document.getElementById('app');
  if (app && app.querySelector('.boot-fallback')) {
    app.innerHTML = '<div class="boot-fallback boot-error" role="alert">INBOX9 could not start. Please reload the page.</div>';
  }
}, 8000);
