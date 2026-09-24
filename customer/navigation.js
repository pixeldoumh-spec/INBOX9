export const CUSTOMER_PAGES = new Set(['buy', 'active', 'orders', 'wallet', 'admin', 'api']);

export function createCustomerNavigation({
  state,
  render,
  loadAdminTab,
  refreshWallet,
  refreshCatalog,
  resetPurchaseFlow,
  toast
}) {
  function pageFromHash() {
    const raw = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
    return CUSTOMER_PAGES.has(raw) ? raw : 'buy';
  }

  function syncPageHash(page, { replace = false } = {}) {
    const target = page === 'buy' ? '' : `#${page}`;
    if (window.location.hash === target || (target === '' && !window.location.hash)) return;
    const url = `${window.location.pathname}${window.location.search}${target}`;
    if (replace) window.history.replaceState({ page }, '', url);
    else window.history.pushState({ page }, '', url);
  }

  function setPage(page, { syncUrl = true } = {}) {
    const next = CUSTOMER_PAGES.has(page) ? page : 'buy';
    if (next === 'admin' && state.user?.role !== 'admin') return;
    state.page = next;
    state.mobileMenu = false;
    if (syncUrl) syncPageHash(next);
    render();
    if (next === 'admin' && state.user?.role === 'admin') void loadAdminTab(state.adminTab);
    if (next === 'wallet') void refreshWallet().then(() => render());
    if (next === 'buy') void refreshCatalog({ silent: true });
  }

  function handleHashNavigation() {
    if (!state.user) return;
    const next = pageFromHash();
    if (next === 'admin' && state.user?.role !== 'admin') return setPage('buy', { syncUrl: true });
    if (state.page === next) return;
    state.page = next;
    state.mobileMenu = false;
    render();
    if (next === 'admin' && state.user?.role === 'admin') void loadAdminTab(state.adminTab);
  }

  function handleSessionExpired() {
    state.bootstrapError = '';
    state.user = null;
    state.active = [];
    state.orders = [];
    state.securityOpen = false;
    resetPurchaseFlow();
    state.page = 'buy';
    syncPageHash('buy', { replace: true });
    render();
    toast('Your session expired. Please sign in again.');
  }

  return {
    pageFromHash,
    syncPageHash,
    setPage,
    handleHashNavigation,
    handleSessionExpired
  };
}
