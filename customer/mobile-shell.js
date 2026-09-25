(() => {
  const ROOT_ID = 'inbox9-mobile-shell';
  let cssLoaded = false;

  const isCustomerSurface = () => {
    const sidebar = document.querySelector('.sidebar');
    return Boolean(sidebar) && !sidebar.querySelector('[data-page="admin"]');
  };

  const loadCss = () => {
    if (cssLoaded || document.querySelector('link[data-inbox9-mobile-shell]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/customer/mobile-shell.css';
    link.dataset.inbox9MobileShell = 'true';
    document.head.appendChild(link);
    cssLoaded = true;
  };

  const go = (page) => {
    const target = document.querySelector(`.sidebar [data-page="${page}"]`);
    if (target) { target.click(); return; }
    window.location.hash = page === 'buy' ? '' : `#${page}`;
  };

  const openBuy = () => {
    const existing = document.querySelector('.customer-buy:not([disabled])');
    if (existing) {
      existing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      existing.focus({ preventScroll: true });
      existing.click();
      return;
    }
    document.querySelector('#service-search')?.focus({ preventScroll: true });
    document.querySelector('#marketplace-services')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const mount = () => {
    if (!isCustomerSurface()) return;
    document.body.classList.add('inbox9-customer-mobile');
    loadCss();
    if (document.getElementById(ROOT_ID)) return;
    const nav = document.createElement('nav');
    nav.id = ROOT_ID;
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Primary navigation');
    nav.innerHTML = `
      <button type="button" class="mobile-nav-item" data-mobile-nav="apps" aria-label="Apps"><span class="mobile-nav-icon" aria-hidden="true">▦</span><span>Apps</span></button>
      <button type="button" class="mobile-nav-item" data-mobile-nav="buy" aria-label="Buy"><span class="mobile-nav-icon" aria-hidden="true">＋</span><span>Buy</span></button>
      <button type="button" class="mobile-nav-item" data-mobile-nav="active" aria-label="Active"><span class="mobile-nav-icon" aria-hidden="true">◉</span><span>Active</span></button>
      <button type="button" class="mobile-nav-item" data-mobile-nav="account" aria-label="Account"><span class="mobile-nav-icon" aria-hidden="true">◎</span><span>Account</span></button>`;
    nav.addEventListener('click', (event) => {
      const item = event.target.closest('[data-mobile-nav]');
      if (!item) return;
      const page = item.dataset.mobileNav;
      if (page === 'apps') go('buy');
      else if (page === 'buy') openBuy();
      else go(page);
    });
    document.body.appendChild(nav);
  };

  const bindServiceTiles = () => {
    if (document.body.dataset.inbox9TileBinding === 'true') return;
    document.body.dataset.inbox9TileBinding = 'true';
    document.addEventListener('click', (event) => {
      if (!document.body.classList.contains('inbox9-customer-mobile')) return;
      const tile = event.target.closest('.customer-service-main[data-toggle-service]');
      if (!tile) return;
      const card = tile.closest('.customer-service-card');
      const buy = card?.querySelector('.customer-buy:not([disabled])');
      if (!buy) return;
      event.preventDefault();
      event.stopPropagation();
      buy.click();
    }, true);
  };

  const sync = () => {
    mount();
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const current = String(window.location.hash || '').replace(/^#/, '') || 'buy';
    root.querySelectorAll('[data-mobile-nav]').forEach((item) => {
      const page = item.dataset.mobileNav;
      item.classList.toggle('active', (page === 'apps' && current === 'buy') || page === current);
    });
  };

  window.addEventListener('hashchange', sync);
  bindServiceTiles();
  new MutationObserver(sync).observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  sync();
})();
