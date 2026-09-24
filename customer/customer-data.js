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
    state.recentActivations = [];
    state.orders = [];
    state.pendingPurchaseKeys = {};
  }

  function persist() {
    // Compatibility hook retained for the UI state machine; account state is not persisted client-side.
  }

  function syncFromServerActivations(activations) {
    const ordered = Array.isArray(activations) ? activations : [];
    state.orders = ordered.map((activation) => ({
      id: activation.id, serviceId: activation.serviceId, service: activation.service, number: activation.number,
      pricePaise: activation.pricePaise, status: activation.status,
      otp: activation.otp || (isLiveActivation(activation) ? 'Waiting…' : '—'),
      createdAt: activation.createdAt,
      created: activation.createdAt ? new Date(activation.createdAt).toLocaleString() : '—'
    }));
    state.active = ordered.filter(isLiveActivation);
    state.recentActivations = ordered
      .filter((activation) => ['Completed', 'Expired', 'Refunded'].includes(String(activation.status || '')))
      .filter((activation) => !activation.createdAt || Number(activation.createdAt) >= Date.now() - 15 * 60 * 1000)
      .slice(0, 6);
    state.activeSyncError = '';
  }

  async function loadCustomerData({ renderAfter = false, silent = false } = {}) {
    if (!state.user) return false;
    state.customerDataRefreshing = !silent;
    state.catalogLoading = true;
    state.catalogError = '';
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
      prepareServiceCatalog();
    } else {
      state.catalogError = servicesResult.reason?.message || 'Service catalog unavailable';
      failures.push(state.catalogError);
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
      state.walletSummary = wallet.summary || { creditPaise: 0, debitPaise: 0, pendingPaise: 0, creditCount: 0, debitCount: 0, pendingCount: 0 };
      state.recharges = Array.isArray(wallet.recharges) ? wallet.recharges : [];
      state.rechargeUpiId = wallet.rechargeEnabled ? (wallet.upiId || null) : null;
    } else {
      failures.push(walletResult.reason?.message || 'Wallet unavailable');
    }
  
    state.error = failures.join(' • ');
    state.customerDataRefreshing = false;
    state.catalogLoading = false;
    if (servicesResult.status === 'fulfilled') state.lastCatalogRefreshAt = Date.now();
    if (renderAfter) render();
    return failures.length === 0;
  }

  async function refreshCatalog({ silent = false } = {}) {
    if (!state.user) return false;
    state.catalogLoading = true;
    state.catalogError = '';
    try {
      const payload = await api('/api/services');
      state.services = Array.isArray(payload.services) ? payload.services : [];
      prepareServiceCatalog();
      state.catalogError = '';
      state.lastCatalogRefreshAt = Date.now();
      if (!silent && state.page === 'buy') renderBuyCatalog();
      return true;
    } catch (error) {
      if (Number(error.status) === 401) {
        handleSessionExpired();
        return false;
      }
      state.catalogError = error.message || 'Service catalog unavailable';
      state.error = state.catalogError;
      if (!silent && state.page === 'buy') renderBuyCatalog();
      return false;
    } finally {
      state.catalogLoading = false;
    }
  }

  return {
    loadPersisted,
    persist,
    syncFromServerActivations,
    loadCustomerData,
    refreshCatalog
  };
}
