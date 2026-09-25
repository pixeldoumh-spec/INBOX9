export const CUSTOMER_PAGES = new Set(['buy', 'active', 'orders', 'wallet', 'support', 'account', 'admin', 'api']);

export function createCustomerNavigation({
  state,
  render,
  loadAdminTab,
  refreshWallet,
  refreshCatalog,
  refreshSupport,
  refreshAccount,
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

  function refreshPageData(next) {
    if (next === 'admin' && state.user?.role === 'admin') void loadAdminTab(state.adminTab);
    if (next === 'buy') void refreshCatalog({ silent: false });
    if (next === 'wallet') void refreshWallet().then(() => render());
    if (next === 'support') void refreshSupport().then(() => {
      if (document.activeElement?.closest?.('#support-form')) return;
      render();
    });
    if (next === 'account') void refreshAccount().then(() => render());
  }

  function setPage(page, { syncUrl = true } = {}) {
    const next = CUSTOMER_PAGES.has(page) ? page : 'buy';
    if (next === 'admin' && state.user?.role !== 'admin') return;
    state.page = next;
    state.mobileMenu = false;
    if (syncUrl) syncPageHash(next);
    render();
    refreshPageData(next);
  }

  function handleHashNavigation({ refreshSamePage = true } = {}) {
    if (!state.user) return;
    const next = pageFromHash();
    if (next === 'admin' && state.user?.role !== 'admin') return setPage('buy', { syncUrl: true });
    if (state.page === next) {
      if (refreshSamePage) refreshPageData(next);
      return;
    }
    state.page = next;
    state.mobileMenu = false;
    render();
    refreshPageData(next);
  }

  function handleSessionExpired() {
    try { window.sessionStorage.removeItem('inbox9.session-hint.v1'); } catch {}
    state.sessionHint = null;
    state.bootstrapError = '';
    state.user = null;
    state.authMode = 'login';
    state.active = [];
    state.orders = [];
    state.recentActivations = [];
    state.activeActionErrorById = {};
    state.supportTickets = [];
    state.supportLoading = false;
    state.supportSubmitting = false;
    state.supportError = '';
    state.securityOpen = false;
    resetPurchaseFlow();
    state.page = 'buy';
    syncPageHash('buy', { replace: true });
    render();
    toast('Your session expired. Please sign in again.');
  }

  window.addEventListener('inbox9:session-expired', handleSessionExpired);

  return {
    pageFromHash,
    syncPageHash,
    setPage,
    handleHashNavigation,
    handleSessionExpired
  };
}
