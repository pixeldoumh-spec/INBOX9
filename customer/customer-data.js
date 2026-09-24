export function createCustomerDataController({
  state,
  api,
  isLiveActivation,
  prepareServiceCatalog,
  handleSessionExpired,
  render,
  renderBuyCatalog
}) {
  function loadPersisted() {
    // Financial and order state is server-authoritative. Browser storage is not used.
    state.active = [];
    state.orders = [];
    state.pendingPurchaseKeys = {};
  }
  
  function persist() {
    // Compatibility hook retained for the UI state machine; account state is not persisted client-side.
  }
  
  function syncFromServerActivations(activations) {
    const ordered = Array.isArray(activations) ? activations : [];
    state.orders = ordered.map((activation) => ({
      id: activation.id, service: activation.service, number: activation.number,
      pricePaise: activation.pricePaise, status: activation.status,
      otp: activation.otp || (isLiveActivation(activation) ? 'Waiting…' : '—'),
      created: activation.createdAt ? new Date(activation.createdAt).toLocaleString() : '—'
    }));
    state.active = ordered.filter(isLiveActivation);
  }
  
  function toast(message) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    document.body.appendChild(node);
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.remove(), 2300);
  }
  
  function resetDemo() {
    state.pendingPurchaseKeys = {};
    toast('Browser cache cleared; server account data is unchanged');
  }
  
  function openMenu() { state.mobileMenu = true; render(); }
  function closeMenu() { state.mobileMenu = false; render(); }
  
  function syncOverlayScrollLock() {
    const purchaseOpen = state.page === 'buy' && ['review', 'activation'].includes(state.purchaseFlow?.step);
    const locked = Boolean(state.securityOpen || purchaseOpen);
    document.documentElement.classList.toggle('overlay-open', locked);
    document.body.classList.toggle('overlay-open', locked);
  }
  
  function activeDialog() {
    return document.querySelector('.purchase-sheet[role="dialog"], .security-modal[role="dialog"]');
  }
  
  function focusableInDialog(dialog) {
    return [...dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((node) => !node.hasAttribute('aria-hidden'));
  }
  
  function focusActiveDialog() {
    const dialog = activeDialog();
    if (!dialog) return;
    const focusable = focusableInDialog(dialog);
    (focusable[0] || dialog).focus();
  }
  
  function restoreDialogFocus() {
    const target = state.dialogReturnFocus;
    state.dialogReturnFocus = null;
    if (!target) return;
    if (target.kind === 'purchase') {
      [...document.querySelectorAll('[data-toggle-service]')]
        .find((item) => item.dataset.toggleService === target.serviceId)?.focus();
    } else if (target.kind === 'security') {
      document.querySelector('[data-action="security"]')?.focus();
    }
  }
  
  function scheduleDialogFocus() {
    window.setTimeout(() => { if (activeDialog()) focusActiveDialog(); }, 0);
  }
  
  async function submitAuth(event) {
    event.preventDefault();
    state.bootstrapError = '';
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    if (state.authMode === 'register' && password !== String(data.get('confirm') || '')) return toast('Passwords do not match');
    try {
      const endpoint = state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload = await api(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      state.user = payload.user;
      state.page = pageFromHash();
      loadPersisted();
      await loadCustomerData();
      toast(state.authMode === 'register' ? 'Account created' : 'Signed in');
      render();
      if (!state.tickTimer) state.tickTimer = window.setInterval(tick, 1000);
    } catch (error) { toast(error.message); }
  }
  
  
  function openSecurity() {
    state.dialogReturnFocus = { kind: 'security' };
    state.securityOpen = true;
    render();
    scheduleDialogFocus();
  }
  function closeSecurity() {
    state.securityOpen = false;
    render();
    restoreDialogFocus();
  }
  
  async function submitChangePassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('currentPassword') || '');
    const newPassword = String(data.get('newPassword') || '');
    const confirmPassword = String(data.get('confirmPassword') || '');
    if (newPassword !== confirmPassword) return toast('New passwords do not match');
    try {
      const payload = await api('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      state.user = payload.user;
      state.securityOpen = false;
      toast('Password changed. Other sessions were signed out.');
      render();
    } catch (error) { toast(error.message); }
  }
  
  async function logoutAll() {
    try { await api('/api/auth/logout-all', { method: 'POST' }); } catch (error) { toast(error.message); return; }
    handleSessionSignedOut();
  }
  
  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
    handleSessionSignedOut();
  }
  
  function handleSessionSignedOut() {
    state.user = null;
    state.active = [];
    state.orders = [];
    state.walletLedger = [];
    state.recharges = [];
    state.securityOpen = false;
    state.expandedServiceId = null;
    resetPurchaseFlow();
    state.page = 'buy';
    syncPageHash('buy', { replace: true });
    render();
  }
  
  async function loadCustomerData({ renderAfter = false, silent = false } = {}) {
    if (!state.user) return false;
    state.customerDataRefreshing = !silent;
    const results = await Promise.allSettled([
      api('/api/services'),
      api('/api/activations'),
      api('/api/wallet')
    ]);
    const [servicesResult, activationsResult, walletResult] = results;
    const failures = [];
    if (results.some((result) => result.status === 'rejected' && Number(result.reason?.status) === 401)) {
      handleSessionExpired();
      return false;
    }
  
    if (servicesResult.status === 'fulfilled') {
      state.services = Array.isArray(servicesResult.value.services) ? servicesResult.value.services : [];
      state.liveProviders = servicesResult.value.liveProviders || {};
      prepareServiceCatalog();
    } else {
      failures.push(servicesResult.reason?.message || 'Service catalog unavailable');
    }
  
    if (activationsResult.status === 'fulfilled') {
      const activationPayload = activationsResult.value;
      if (activationPayload.persistent) syncFromServerActivations(activationPayload.activations);
    } else {
      failures.push(activationsResult.reason?.message || 'Activation history unavailable');
    }
  
    if (walletResult.status === 'fulfilled') {
      const wallet = walletResult.value;
      state.persistentState = Boolean(wallet.persistent);
      state.balancePaise = Number(wallet.balancePaise || 0);
      state.walletLedger = Array.isArray(wallet.ledger) ? wallet.ledger : [];
      state.recharges = Array.isArray(wallet.recharges) ? wallet.recharges : [];
      state.rechargeUpiId = wallet.rechargeEnabled ? (wallet.upiId || null) : null;
    } else {
      failures.push(walletResult.reason?.message || 'Wallet unavailable');
    }
  
    state.error = failures.join(' • ');
    state.customerDataRefreshing = false;
    state.lastCatalogRefreshAt = Date.now();
    if (renderAfter) render();
    return failures.length === 0;
  }
  
  async function refreshCatalog({ silent = false } = {}) {
    if (!state.user) return false;
    try {
      const payload = await api('/api/services');
      state.services = Array.isArray(payload.services) ? payload.services : [];
      state.liveProviders = payload.liveProviders || {};
      prepareServiceCatalog();
      state.lastCatalogRefreshAt = Date.now();
      if (!silent && state.page === 'buy') renderBuyCatalog();
      return true;
    } catch (error) {
      if (Number(error.status) === 401) {
        handleSessionExpired();
        return false;
      }
      state.error = error.message || 'Service catalog unavailable';
      if (!silent && state.page === 'buy') renderBuyCatalog();
      return false;
    }
  }
  
  
}
