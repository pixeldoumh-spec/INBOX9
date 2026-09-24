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
