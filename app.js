const state = {
  page: 'buy',
  search: '',
  category: 'All',
  balancePaise: 0,
  walletLedger: [],
  recharges: [],
  rechargeAmount: 100,
  services: [],
  active: [],
  orders: [],
  loading: true,
  error: '',
  persistentState: false,
  rechargeUpiId: null,
  mobileMenu: false,
  toastTimer: null,
  user: null,
  authMode: 'login',
  adminTab: 'overview',
  adminLoading: false,
  adminError: '',
  admin: { overview: null, recharges: [], users: [], services: [], activations: [], ledger: [], audit: [], providers: [] },
  pendingPurchaseKeys: {},
  purchaseBusy: new Set(),
  securityOpen: false,
  dialogReturnFocus: null,
  expandedServiceId: null,
  marketVisibleCount: 48,
  categoryCounts: {},
  serviceSearchIndex: [],
  marketSearchTimer: null,
  marketServerStats: {},
  marketServerLoading: {},
  tickTimer: null,
  purchaseFlow: {
    step: 'service',
    serviceId: null,
    serverId: null,
    submitting: false,
    error: '',
    returnAfterWallet: false
  }
};

const nav = [
  ['buy', 'Buy Number', '▣'],
  ['active', 'Active', '◌'],
  ['orders', 'Orders', '▤'],
  ['wallet', 'Wallet', '▱']
];
const categories = ['All', 'Social', 'Productivity', 'Rummy', 'Games', 'Other'];

function appNav() {
  return state.user?.role === 'admin'
    ? [...nav, ['admin', 'Admin', '⚙'], ['api', 'API', 'ϟ']]
    : nav;
}

const categoryIcon = { Social: '◉', Productivity: '✦', Rummy: '◆', Games: '♟' };
const MARKET_PAGE_SIZE = 48;
const MARKET_MAX_SEARCH_RESULTS = 96;

function normalizeSearchText(value) {
  return String(value ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
}

function prepareServiceCatalog() {
  const services = Array.isArray(state.services) ? state.services : [];
  state.serviceSearchIndex = services.map((service) => ({ service, text: normalizeSearchText(service.name) }));
  state.categoryCounts = categories.reduce((counts, category) => {
    counts[category] = category === 'All' ? services.length : services.filter((service) => service.category === category).length;
    return counts;
  }, {});
}

function filteredMarketServices() {
  const query = normalizeSearchText(state.search);
  const source = state.serviceSearchIndex.length
    ? state.serviceSearchIndex
    : (state.services || []).map((service) => ({ service, text: normalizeSearchText(service.name) }));
  return source
    .filter(({ service, text }) => (state.category === 'All' || service.category === state.category) && (!query || text.includes(query)))
    .map(({ service }) => service);
}

function marketResultText(total, visible) {
  if (!total) return 'No matching services';
  return `Showing 1–${Math.min(total, visible)} of ${total} services`;
}

function scheduleMarketSearch(value) {
  state.search = value;
  window.clearTimeout(state.marketSearchTimer);
  state.marketSearchTimer = window.setTimeout(() => {
    state.marketVisibleCount = state.search ? MARKET_MAX_SEARCH_RESULTS : MARKET_PAGE_SIZE;
    state.expandedServiceId = null;
    renderBuyCatalog();
  }, 60);
}


const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const money = (paise) => `₹${(Number(paise || 0) / 100).toFixed(2)}`;
const iconFor = (category) => categoryIcon[category] || '•';

function loadPersisted() {
  // Financial and order state is server-authoritative. Browser storage is not used.
  state.active = [];
  state.orders = [];
  state.pendingPurchaseKeys = {};
}

function persist() {
  // Compatibility hook retained for the UI state machine; account state is not persisted client-side.
}

function isLiveActivation(item) {
  return ['Active', 'CancellationPending', 'ExpirationPending'].includes(String(item?.status || ''));
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

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, headers: { accept: 'application/json', ...(options.headers || {}) } });
  } catch (networkError) {
    networkError.status = 0;
    networkError.code = 'NETWORK_ERROR';
    throw networkError;
  }
  let payload;
  try { payload = await response.json(); } catch { payload = { error: `HTTP ${response.status}` }; }
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = payload.code || null;
    error.retryAfter = response.headers.get('Retry-After');
    throw error;
  }
  return payload;
}

function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.appendChild(node);
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => node.remove(), 2300);
}

function setPage(page) {
  state.page = page;
  state.mobileMenu = false;
  render();
  if (page === 'admin' && state.user?.role === 'admin') loadAdminTab(state.adminTab);
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
  const form = event.currentTarget;
  const data = new FormData(form);
  const email = String(data.get('email') || '').trim();
  const password = String(data.get('password') || '');
  if (state.authMode === 'register' && password !== String(data.get('confirm') || '')) return toast('Passwords do not match');
  try {
    const endpoint = state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const payload = await api(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    state.user = payload.user;
    loadPersisted();
    await refreshWallet();
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
  state.user = null;
  state.active = [];
  state.orders = [];
  state.securityOpen = false;
  render();
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
  state.user = null;
  state.active = [];
  state.orders = [];
  render();
}

async function boot() {
  try {
    const session = await api('/api/auth/me');
    state.user = session.user;
    loadPersisted();
  } catch {
    state.user = null;
    state.loading = false;
    render();
    return;
  }
  try {
    const results = await Promise.allSettled([
      api('/api/services'),
      api('/api/activations'),
      api('/api/wallet')
    ]);
    const [servicesResult, activationsResult, walletResult] = results;
    const failures = [];

    if (servicesResult.status === 'fulfilled') {
      state.services = Array.isArray(servicesResult.value.services) ? servicesResult.value.services : [];
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
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
  if (!state.tickTimer) state.tickTimer = window.setInterval(tick, 1000);
}

function resetPurchaseFlow() {
  state.purchaseFlow = {
    step: 'service',
    serviceId: null,
    serverId: null,
    submitting: false,
    error: '',
    returnAfterWallet: false
  };
}

function purchaseFlowData() {
  const service = state.services.find((item) => item.id === state.purchaseFlow.serviceId);
  const pricePaise = Number(service?.pricePaise || 0);
  return {
    service,
    server: null,
    pricePaise,
    afterBalancePaise: Math.max(0, state.balancePaise - pricePaise)
  };
}

function openPurchaseReview(serviceId) {
  const service = state.services.find((item) => item.id === serviceId);
  if (!service) return;
  if (Number(service.stock || 0) <= 0) return toast('That service is currently unavailable');
  state.dialogReturnFocus = { kind: 'purchase', serviceId };
  state.purchaseFlow = {
    step: 'review',
    serviceId,
    serverId: null,
    submitting: false,
    error: '',
    returnAfterWallet: false
  };
  renderBuyCatalog();
  scheduleDialogFocus();
}

function closePurchaseReview() {
  if (state.purchaseFlow.submitting) return;
  resetPurchaseFlow();
  renderBuyCatalog();
  restoreDialogFocus();
}

function purchaseReviewModal() {
  const flow = state.purchaseFlow;
  if (!['review', 'activation'].includes(flow.step)) return '';
  const data = purchaseFlowData();
  if (!data.service) return '';
  const insufficient = state.balancePaise < data.pricePaise;
  const activating = flow.step === 'activation' || flow.submitting;
  const availability = Math.max(0, Number(data.service.stock || 0));
  const error = flow.error ? `<div class="purchase-error">${esc(flow.error)}</div>` : '';
  if (activating) return `<div class="purchase-overlay" role="presentation"><div class="purchase-backdrop"></div><section class="purchase-sheet purchase-sheet-loading" role="dialog" aria-modal="true" aria-labelledby="purchase-title" tabindex="-1"><div class="purchase-sheet-top"><div><span class="kicker">STEP 3 OF 3</span><h2 id="purchase-title">Getting your number</h2></div></div><div class="purchase-steps" aria-label="Purchase progress"><span class="purchase-step done"><b>1</b> Service</span><span class="purchase-step done"><b>2</b> Review</span><span class="purchase-step current"><b>3</b> Track</span></div><div class="purchase-activation-state"><div class="purchase-loader" aria-hidden="true"></div><span class="service-category">ACTIVATION</span><h3>Reserving your number…</h3><p>We’re assigning a number automatically now. Your live activation will appear next.</p></div></section></div>`;
  return `<div class="purchase-overlay" role="presentation"><button class="purchase-backdrop" type="button" aria-label="Close purchase review" data-purchase-close></button><section class="purchase-sheet" role="dialog" aria-modal="true" aria-labelledby="purchase-title" tabindex="-1"><div class="purchase-sheet-top"><div><span class="kicker">STEP 2 OF 3</span><h2 id="purchase-title">Review your number</h2></div><button class="icon-btn" type="button" aria-label="Close" data-purchase-close>×</button></div><div class="purchase-steps" aria-label="Purchase progress"><span class="purchase-step done"><b>1</b> Service</span><span class="purchase-step current"><b>2</b> Review</span><span class="purchase-step"><b>3</b> Track</span></div><div class="purchase-service-card"><div class="service-icon large">${iconFor(data.service.category)}</div><div class="purchase-service-copy"><span class="service-category">${esc(data.service.category)}</span><strong>${esc(data.service.name)}</strong><span>India (+91) · OTP appears in about 20 seconds</span></div></div><div class="purchase-detail-grid"><div><span>Country</span><strong>India (+91)</strong><small>Current INBOX9 market</small></div><div><span>Price</span><strong>${money(data.pricePaise)}</strong><small>One activation</small></div><div><span>Availability</span><strong>${availability.toLocaleString()}</strong><small>numbers available</small></div><div><span>Activation window</span><strong>3 minutes</strong><small>INBOX9 lifecycle</small></div></div><div class="purchase-trust"><span>✓</span><div><strong>Number first. OTP next.</strong><small>INBOX9 reserves the number immediately. The OTP is generated automatically around 20 seconds into the activation.</small></div></div>${error}${insufficient ? `<div class="purchase-actions"><button class="secondary-btn" type="button" data-purchase-close>Back</button><button class="primary-btn" type="button" data-purchase-wallet>Add funds</button></div>` : `<div class="purchase-actions"><button class="secondary-btn" type="button" data-purchase-close>Back</button><button class="primary-btn purchase-confirm-btn" type="button" data-purchase-confirm>Get number <span>→</span></button></div>`}</section></div>`;
}

async function confirmPurchase() {
  const data = purchaseFlowData();
  if (!data.service) return;
  if (state.balancePaise < data.pricePaise) {
    state.purchaseFlow.error = 'You need more wallet balance to complete this activation.';
    renderBuyCatalog();
    return;
  }
  state.purchaseFlow.step = 'activation';
  state.purchaseFlow.submitting = true;
  state.purchaseFlow.error = '';
  renderBuyCatalog();
  scheduleDialogFocus();
  await buy(data.service.id);
}

async function buy(serviceId, serverId = null) {
  const purchaseKey = `${serviceId}:${serverId || 'auto'}`;
  if (state.purchaseBusy.has(purchaseKey)) {
    toast('Purchase request is already in progress');
    return;
  }
  if (state.purchaseFlow.serviceId === serviceId && state.purchaseFlow.serverId === serverId) {
    state.purchaseFlow.step = 'activation';
    state.purchaseFlow.submitting = true;
    state.purchaseFlow.error = '';
  }
  if (state.balancePaise < (state.services.find((s) => s.id === serviceId)?.pricePaise || 0)) {
    resetPurchaseFlow();
    state.page = 'wallet';
    render();
    toast('Insufficient wallet balance. Please recharge first.');
    return;
  }
  const key = state.pendingPurchaseKeys[purchaseKey] || (crypto.randomUUID ? crypto.randomUUID() : `purchase-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  state.pendingPurchaseKeys[purchaseKey] = key;
  state.purchaseBusy.add(purchaseKey);
  persist();
  try {
    const activation = await api('/api/activations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ serviceId, ...(serverId ? { serverId } : {}) })
    });
    delete state.pendingPurchaseKeys[purchaseKey];
    state.purchaseBusy.delete(purchaseKey);
    state.active.unshift(activation);
    state.orders.unshift({ id: activation.id, service: activation.service, number: activation.number, pricePaise: activation.pricePaise, status: 'Active', otp: 'Waiting…', created: 'Just now' });
    if (Number.isFinite(activation.walletBalancePaise)) state.balancePaise = activation.walletBalancePaise;
    else state.balancePaise = Math.max(0, state.balancePaise - Number(activation.pricePaise || 0));
    state.page = 'active';
    resetPurchaseFlow();
    persist();
    render();
    toast(`${activation.service} • Number reserved`);
  } catch (error) {
    state.purchaseBusy.delete(purchaseKey);
    if (error.code === 'IDEMPOTENCY_IN_PROGRESS') {
      state.purchaseFlow.step = 'activation';
      state.purchaseFlow.submitting = true;
      persist();
      toast('Your purchase is still processing. Check Active shortly.');
      renderBuyCatalog();
      return;
    }
    if (error.code === 'NETWORK_ERROR') {
      state.purchaseFlow.step = 'review';
      state.purchaseFlow.submitting = false;
      state.purchaseFlow.error = 'The request may still be processing. You can safely retry.';
      persist();
      renderBuyCatalog();
      return;
    }
    delete state.pendingPurchaseKeys[purchaseKey];
    state.purchaseFlow.step = 'review';
    state.purchaseFlow.submitting = false;
    state.purchaseFlow.error = error.message || 'We could not complete this activation.';
    persist();
    if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
      toast('Purchase request could not be reused. Please start a new purchase.');
    } else {
      toast(error.message);
    }
    renderBuyCatalog();
  }
}

async function cancelActivation(id) {
  const item = state.active.find((entry) => entry.id === id);
  if (!item) return;
  if (item?.metadata?.engine === 'synthetic-local') {
    const index = state.active.findIndex((entry) => entry.id === id);
    if (index >= 0) state.active.splice(index, 1);
    state.balancePaise += Number(item.pricePaise || 0);
    const order = state.orders.find((entry) => entry.id === id);
    if (order) { order.status = 'Refunded'; order.otp = '—'; }
    persist();
    render();
    toast('Synthetic activation cancelled • credits refunded');
    return;
  }
  try {
    const result = await api(`/api/activations/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
    const index = state.active.findIndex((entry) => entry.id === id);
    if (index >= 0) state.active.splice(index, 1);
    if (Number.isFinite(result.walletBalancePaise)) state.balancePaise = result.walletBalancePaise;
    const order = state.orders.find((entry) => entry.id === id);
    if (order) { order.status = 'Refunded'; order.otp = '—'; }
    persist();
    render();
    toast('Activation cancelled and wallet refunded');
  } catch (error) {
    toast(error.message);
  }
}

async function refreshWallet() {
  try {
    const wallet = await api('/api/wallet');
    state.persistentState = Boolean(wallet.persistent);
    state.balancePaise = Number(wallet.balancePaise || 0);
    state.walletLedger = Array.isArray(wallet.ledger) ? wallet.ledger : [];
    state.recharges = Array.isArray(wallet.recharges) ? wallet.recharges : [];
    state.rechargeUpiId = wallet.rechargeEnabled ? (wallet.upiId || null) : null;
    return wallet;
  } catch (error) {
    toast(error.message);
    return null;
  }
}

async function submitRecharge(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const amount = Number(data.get('amount'));
  const utr = String(data.get('utr') || '').trim();
  if (!Number.isInteger(amount) || amount < 100 || amount > 5000) return toast('Recharge amount must be between ₹100 and ₹5,000');
  if (!/^[A-Za-z0-9._-]{4,64}$/.test(utr)) return toast('Enter a valid UTR / transaction reference');
  try {
    await api('/api/recharges', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount, utr }) });
    await refreshWallet();
    toast('Recharge submitted for verification');
    render();
  } catch (error) { toast(error.message); }
}

function setRechargeAmount(amount) {
  state.rechargeAmount = Math.min(5000, Math.max(100, Number(amount) || 100));
  render();
  document.getElementById('recharge-amount')?.focus();
}

let lastActivationSync = 0;
let activationSyncInFlight = false;

async function syncActivationItem(item) {
  if (item?.metadata?.engine === 'synthetic-local') {
    const now = Date.now();
    const updated = { ...item };
    if (item.mockOtpAt && now >= item.mockOtpAt) {
      updated.status = 'Completed';
      updated.otp = item.syntheticOtp || updated.otp || '000000';
    } else if (item.expiresAt && now >= item.expiresAt) {
      updated.status = 'Expired';
      updated.otp = null;
    }
    const order = state.orders.find((entry) => entry.id === item.id);
    if (order) {
      order.status = updated.status;
      order.otp = updated.otp || (isLiveActivation(updated) ? 'Waiting…' : '—');
    }
    const index = state.active.findIndex((entry) => entry.id === item.id);
    if (isLiveActivation(updated)) {
      if (index >= 0) state.active[index] = updated;
    } else if (index >= 0) {
      state.active.splice(index, 1);
    }
    return;
  }
  try {
    const latest = await api(`/api/activations/${encodeURIComponent(item.id)}`);
    const order = state.orders.find((entry) => entry.id === item.id);
    if (order) {
      order.status = latest.status;
      order.otp = latest.otp || (isLiveActivation(latest) ? 'Waiting…' : '—');
    }
    const index = state.active.findIndex((entry) => entry.id === item.id);
    if (isLiveActivation(latest)) {
      if (index >= 0) state.active[index] = { ...state.active[index], ...latest };
      else state.active.push(latest);
    } else if (index >= 0) {
      state.active.splice(index, 1);
    }
  } catch (error) {
    if (!/Activation not found/i.test(error.message)) console.warn('activation.sync_failed', error.message);
  }
}

async function tick() {
  if (!state.user || !state.active.length) {
    if (state.page === 'active') renderActiveOnly();
    return;
  }
  if (activationSyncInFlight) return;
  const now = Date.now();
  if (now - lastActivationSync < 2500) {
    if (state.page === 'active') renderActiveOnly();
    return;
  }
  lastActivationSync = now;
  activationSyncInFlight = true;
  try {
    const current = [...state.active];
    const concurrency = 4;
    for (let start = 0; start < current.length; start += concurrency) {
      const batch = current.slice(start, start + concurrency);
      await Promise.all(batch.map((item) => syncActivationItem(item)));
    }
    persist();
    if (state.page === 'active') renderActiveOnly();
  } finally {
    activationSyncInFlight = false;
  }
}


async function loadAdminTab(tab = state.adminTab) {
  if (state.user?.role !== 'admin') return;
  state.adminTab = tab;
  state.adminLoading = true;
  state.adminError = '';
  render();
  const routes = {
    overview: ['/api/admin/overview', 'overview'],
    recharges: ['/api/admin/recharges', 'recharges'],
    users: ['/api/admin/users', 'users'],
    services: ['/api/admin/services', 'services'],
    activations: ['/api/admin/activations', 'activations'],
    ledger: ['/api/admin/ledger', 'ledger'],
    audit: ['/api/admin/audit', 'audit'],
    providers: ['/api/admin/providers', 'providers']
  };
  try {
    const [url, key] = routes[tab] || routes.overview;
    const payload = await api(url);
    if (key === 'overview') state.admin.overview = payload;
    else state.admin[key] = Array.isArray(payload[key]) ? payload[key] : [];
  } catch (error) {
    state.adminError = error.message;
  } finally {
    state.adminLoading = false;
    render();
  }
}

async function adminAction(url, body) {
  try {
    await api(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    toast('Admin action completed');
    await loadAdminTab(state.adminTab);
  } catch (error) {
    toast(error.message);
  }
}

async function adminUpdateService(id, form) {
  const data = new FormData(form);
  const payload = {
    pricePaise: Math.round(Number(data.get('price') || 0) * 100),
    stock: Number(data.get('stock') || 0),
    active: data.get('active') === 'on',
    availability: String(data.get('availability') || 'high')
  };
  try {
    await api(`/api/admin/services/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    toast('Service updated');
    await loadAdminTab('services');
  } catch (error) {
    toast(error.message);
  }
}

function adminPage() {
  if (state.user?.role !== 'admin') return `<div class="panel empty"><div class="empty-icon">!</div><h3>Admin access required</h3><p>Your account does not have permission to open the operations center.</p></div>`;
  const tabs = [
    ['overview', 'Overview'], ['recharges', 'UTR Queue'], ['services', 'Services'],
    ['users', 'Users'], ['activations', 'Activations'], ['ledger', 'Ledger'],
    ['providers', 'Providers'], ['audit', 'Audit Log']
  ];
  const body = state.adminLoading
    ? `<div class="panel admin-loading">Loading ${esc(state.adminTab)}…</div>`
    : state.adminError
      ? `<div class="panel admin-error">${esc(state.adminError)}</div>`
      : renderAdminTab(state.adminTab);
  return `<div class="section-head"><div><span class="kicker">OPERATIONS</span><h2>Admin control center</h2></div><span class="mock-badge">ADMIN ONLY</span></div>
    <div class="admin-tabs" role="tablist">${tabs.map(([id,label]) => `<button class="filter-btn ${state.adminTab === id ? 'selected' : ''}" type="button" data-admin-tab="${id}">${label}</button>`).join('')}</div>
    ${body}`;
}

function renderAdminTab(tab) {
  if (tab === 'overview') return adminOverviewPage();
  if (tab === 'recharges') return adminRechargesPage();
  if (tab === 'services') return adminServicesPage();
  if (tab === 'users') return adminUsersPage();
  if (tab === 'activations') return adminActivationsPage();
  if (tab === 'ledger') return adminLedgerPage();
  if (tab === 'providers') return adminProvidersPage();
  if (tab === 'audit') return adminAuditPage();
  return adminOverviewPage();
}

function adminOverviewPage() {
  const o = state.admin.overview || {};
  const cards = [
    ['Active users', o.users || 0], ['Active activations', o.activeActivations || 0],
    ['Pending UTR value', money(o.pendingRechargePaise || 0)], ['Wallet liability', money(o.walletBalancePaise || 0)],
    ['Approved recharge volume', money(o.approvedRechargePaise || 0)], ['Total wallet debits', money(o.totalDebitsPaise || 0)]
  ];
  return `<div class="admin-kpi-grid">${cards.map(([label,value]) => `<div class="panel admin-kpi"><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
  <div class="admin-grid-two"><div class="panel admin-card"><div class="panel-head"><div><h3>Operations</h3><span>Use the tabs above to operate the platform.</span></div></div><div class="admin-checklist"><div>✓ User accounts and roles</div><div>✓ UTR verification queue</div><div>✓ Service pricing and inventory</div><div>✓ Activation monitoring</div><div>✓ Wallet ledger visibility</div><div>✓ Provider health</div><div>✓ Immutable audit trail</div></div></div>
  <div class="panel admin-card"><div class="panel-head"><div><h3>Safety rules</h3><span>Production financial controls</span></div></div><p class="admin-copy">UTR submission does not credit a wallet. Only an authorized admin approval creates the corresponding ledger credit. Service configuration changes are audited.</p></div></div>`;
}

function adminRechargesPage() {
  const rows = state.admin.recharges.length ? state.admin.recharges.map(r => `<tr><td class="mono">${esc(r.id)}</td><td>${esc(r.email)}</td><td><strong>${money(r.amountPaise)}</strong></td><td class="mono">${esc(r.utr)}</td><td>${esc(new Date(r.submittedAt).toLocaleString())}</td><td><div class="admin-verify-fields"><label>Verified amount<input type="number" min="100" max="5000" step="0.01" value="${(Number(r.amountPaise || 0) / 100).toFixed(2)}" data-admin-verified-amount></label><label>Verified UTR<input type="text" minlength="4" maxlength="64" value="${esc(r.utr)}" data-admin-verified-utr></label><label>External reference <span>(optional)</span><input type="text" maxlength="120" placeholder="Bank/payment ref" data-admin-external-reference></label></div><div class="admin-actions"><button class="buy-btn" type="button" data-admin-approve="${esc(r.id)}">Approve verified payment</button><button class="text-danger admin-reject" type="button" data-admin-reject="${esc(r.id)}">Reject</button></div></td></tr>`).join('') : `<tr><td colspan="6"><div class="empty-mini">No pending recharge requests.</div></td></tr>`;
  return `<div class="panel table-panel"><div class="panel-head"><div><h3>Pending UTR verification</h3><span>Verify the payment independently before approving.</span></div></div><table><thead><tr><th>Request</th><th>User</th><th>Amount</th><th>UTR</th><th>Submitted</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function adminServicesPage() {
  const rows = state.admin.services.length ? state.admin.services.map(s => `<tr><td><strong>${esc(s.name)}</strong><small class="table-sub">${esc(s.category)} · ${esc(s.id)}</small></td><td><form class="admin-service-form" data-admin-service-form="${esc(s.id)}"><input name="price" type="number" min="0" max="1000000" step="0.01" value="${(s.pricePaise/100).toFixed(2)}" aria-label="Price for ${esc(s.name)}"><input name="stock" type="number" min="0" max="1000000" step="1" value="${s.stock}" aria-label="Stock for ${esc(s.name)}"><select name="availability" aria-label="Availability for ${esc(s.name)}"><option value="high" ${s.availability==='high'?'selected':''}>High</option><option value="medium" ${s.availability==='medium'?'selected':''}>Medium</option><option value="low" ${s.availability==='low'?'selected':''}>Low</option></select><label class="check-inline"><input name="active" type="checkbox" ${s.active?'checked':''}> Active</label><button class="buy-btn" type="submit">Save</button></form></td></tr>`).join('') : `<tr><td colspan="2"><div class="empty-mini">No services found.</div></td></tr>`;
  return `<div class="panel table-panel"><div class="panel-head"><div><h3>Service catalog controls</h3><span>Price is entered in INR; stored as paise.</span></div><span>${state.admin.services.length} services</span></div><table class="admin-services-table"><thead><tr><th>Service</th><th>Configuration</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function adminUsersPage() {
  const rows = state.admin.users.length ? state.admin.users.map(u => `<tr><td class="mono">${esc(u.id)}</td><td><strong>${esc(u.email)}</strong><small class="table-sub">${esc(u.role)}</small></td><td>${u.active ? 'Active' : 'Disabled'}</td><td>${money(u.balancePaise)}</td><td>${u.rechargeCount}</td><td>${u.activationCount}</td><td>${esc(new Date(u.createdAt).toLocaleDateString())}</td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-mini">No users found.</div></td></tr>`;
  return `<div class="panel table-panel"><div class="panel-head"><div><h3>User directory</h3><span>Read-only operational view.</span></div></div><table><thead><tr><th>ID</th><th>Account</th><th>Status</th><th>Balance</th><th>Recharges</th><th>Activations</th><th>Joined</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function adminActivationsPage() {
  const rows = state.admin.activations.length ? state.admin.activations.map(a => `<tr><td class="mono">${esc(a.id)}</td><td>${esc(a.email || '—')}</td><td><strong>${esc(a.service)}</strong></td><td>${esc(a.number)}</td><td><span class="table-status ${a.status.toLowerCase()}">${esc(a.status)}</span></td><td>${esc(a.providerId || '—')}</td><td>${money(a.pricePaise)}</td><td>${esc(new Date(a.createdAt).toLocaleString())}</td></tr>`).join('') : `<tr><td colspan="8"><div class="empty-mini">No activations found.</div></td></tr>`;
  return `<div class="panel table-panel"><div class="panel-head"><div><h3>Activation monitor</h3><span>Latest activation records across all users.</span></div></div><table><thead><tr><th>Order</th><th>User</th><th>Service</th><th>Number</th><th>Status</th><th>Provider</th><th>Price</th><th>Created</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function adminLedgerPage() {
  const rows = state.admin.ledger.length ? state.admin.ledger.map(e => `<tr><td class="mono">${esc(e.id)}</td><td>${esc(e.email)}</td><td><span class="table-status ${e.type==='credit'?'approved':'refunded'}">${esc(e.type)}</span></td><td>${money(e.amountPaise)}</td><td>${esc(e.referenceType)} / ${esc(e.referenceId)}</td><td>${esc(e.description)}</td><td>${esc(new Date(e.createdAt).toLocaleString())}</td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-mini">No ledger entries found.</div></td></tr>`;
  return `<div class="panel table-panel"><div class="panel-head"><div><h3>Wallet ledger</h3><span>Read-only immutable accounting history.</span></div></div><table><thead><tr><th>Entry</th><th>User</th><th>Type</th><th>Amount</th><th>Reference</th><th>Description</th><th>Created</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function providerUiName(provider) {
  return provider?.id === 'provider-mock'
    ? 'Activation Service'
    : String(provider?.name || 'Provider');
}

function providerUiKey(provider) {
  return provider?.id === 'provider-mock'
    ? 'Managed service'
    : String(provider?.adapterKey || '—');
}

function adminProvidersPage() {
  const rows = state.admin.providers.length ? state.admin.providers.map(p => `<tr><td><strong>${esc(providerUiName(p))}</strong><small class="table-sub">${esc(providerUiKey(p))}</small></td><td>${p.active ? 'Active' : 'Disabled'}</td><td>${p.routedServices}</td><td><span class="table-status ${p.healthy ? 'approved' : 'rejected'}">${p.healthy ? 'Healthy' : 'Unhealthy'}</span></td><td>${esc(p.error || p.message || '—')}</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-mini">No providers available.</div></td></tr>`;
  return `<div class="panel table-panel"><div class="panel-head"><div><h3>Provider registry</h3><span>Routing and health status.</span></div></div><table><thead><tr><th>Provider</th><th>Status</th><th>Routes</th><th>Health</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function adminAuditPage() {
  const rows = state.admin.audit.length ? state.admin.audit.map(a => `<tr><td class="mono">${esc(a.id)}</td><td>${esc(a.actorEmail || 'System')}</td><td><strong>${esc(a.action)}</strong></td><td>${esc(a.targetType)}</td><td class="mono">${esc(a.targetId || '—')}</td><td><code>${esc(JSON.stringify(a.metadata))}</code></td><td>${esc(new Date(a.createdAt).toLocaleString())}</td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-mini">No audit events found.</div></td></tr>`;
  return `<div class="panel table-panel"><div class="panel-head"><div><h3>Audit log</h3><span>Administrative actions are append-only.</span></div></div><table><thead><tr><th>Event</th><th>Actor</th><th>Action</th><th>Target</th><th>Target ID</th><th>Metadata</th><th>Created</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function authPage() {
  const register = state.authMode === 'register';
  return `<div class="auth-shell"><div class="auth-card"><div class="brand-row auth-brand"><div class="brand-mark">ϟ</div><div><div class="brand-name">INBOX9</div><div class="brand-sub">OTP MARKETPLACE</div></div></div><span class="kicker">SECURE ACCOUNT</span><h1>${register ? 'Create your account' : 'Welcome back'}</h1><p class="auth-copy">${register ? 'Create an account to access the marketplace.' : 'Sign in to continue to your INBOX9 dashboard.'}</p><form id="auth-form"><label>Email<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><label>Password<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="8" required placeholder="Minimum 8 characters"></label>${register ? '<label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="8" required placeholder="Repeat your password"></label>' : ''}<button class="primary-btn auth-submit" type="submit">${register ? 'Create account' : 'Sign in'}</button></form><div class="auth-switch">${register ? 'Already have an account?' : 'New to INBOX9?'} <button type="button" data-auth-mode="${register ? 'login' : 'register'}">${register ? 'Sign in' : 'Create account'}</button></div><div class="auth-note">Your account is protected with email and password. Secure access is required for every session.</div></div></div>`;
}

function securityModal() {
  return `<div class="security-overlay" role="presentation"><section class="security-modal" role="dialog" aria-modal="true" aria-labelledby="security-title" tabindex="-1"><div class="panel-head"><div><h3 id="security-title">Account security</h3><span>7-day sessions • maximum 5 retained sessions by default</span></div><button class="icon-btn" type="button" aria-label="Close" data-action="close-security">×</button></div><div class="security-body"><form id="change-password-form" class="security-form"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" minlength="8" required></label><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button class="primary-btn" type="submit">Change password</button></form><div class="security-divider"></div><div class="security-danger"><div><strong>Sign out all sessions</strong><p>This invalidates every active session on all devices and returns you to the login screen.</p></div><button class="buy-btn" type="button" data-action="logout-all">Sign out all</button></div></div></section></div>`;
}

function render() {
  if (!state.user) {
    syncOverlayScrollLock();
    document.getElementById('app').innerHTML = authPage();
    bindEvents();
    return;
  }
  if (state.page === 'admin' && state.user?.role !== 'admin') state.page = 'buy';
  const current = appNav().find(([id]) => id === state.page)?.[1] || 'Buy Number';
  document.getElementById('app').innerHTML = `
    <div class="app-shell">
      <aside class="sidebar ${state.mobileMenu ? 'open' : ''}" aria-label="Primary navigation">
        <div class="brand-row">
          <div class="brand-mark" aria-hidden="true">ϟ</div>
          <div><div class="brand-name">INBOX9</div><div class="brand-sub">OTP MARKETPLACE</div></div>
          <button class="close-mobile" type="button" aria-label="Close menu" data-action="close-menu">×</button>
        </div>
        <div class="nav-label">MARKET</div>
        <nav>
          ${appNav().map(([id, label, glyph]) => `<button class="nav-item ${state.page === id ? 'active' : ''}" type="button" data-page="${id}"><span>${glyph}</span>${label}${id === 'active' && state.active.length ? `<span class="count-badge">${state.active.length}</span>` : ''}</button>`).join('')}
        </nav>
        <div class="sidebar-spacer"></div>
        <div class="trust-card"><span>✓</span><div><strong>Secure activation</strong><span>Protected service layer</span></div></div>
        <div class="user-card"><div class="avatar">PX</div><div class="user-copy"><strong>${esc(state.user?.email || "User")}</strong><span>${esc(state.user?.role || "user")} account</span></div><button class="icon-btn" type="button" aria-label="Account security" data-action="security">⌘</button><button class="icon-btn" type="button" aria-label="Sign out" data-action="logout">↪</button></div>
      </aside>
      ${state.mobileMenu ? '<button class="mobile-backdrop" type="button" aria-label="Close navigation" data-action="close-menu"></button>' : ''}
      <main class="main">
        <header class="topbar">
          <div class="breadcrumb"><button class="menu-btn icon-btn" type="button" aria-label="Open menu" data-action="open-menu">☰</button><span>Market</span><span>/</span><strong>${esc(current)}</strong></div>
          <div class="top-actions"><button class="wallet-chip" type="button" data-page="wallet">▱ ${money(state.balancePaise)} <b>+</b></button><button class="icon-btn notification" type="button" aria-label="Notifications">♧<span></span></button></div>
        </header>
        <section class="content-wrap">
          ${state.page === 'buy' ? hero() : ''}
          ${state.error ? `<div class="panel" style="padding:14px;margin-bottom:16px;color:#ffb0b0">API error: ${esc(state.error)}</div>` : ''}
          <div id="content">${content()}</div>
        </section>
      </main>
      ${state.securityOpen ? securityModal() : ''}
    </div>`;
  bindEvents();
  syncOverlayScrollLock();
  if (state.securityOpen) scheduleDialogFocus();
}

function hero() {
  const activeCount = state.active.length;
  const serviceCount = state.services.length;
  return `<section class="hero-strip premium-hero">
    <div class="hero-copy">
      <div class="hero-eyebrow"><span class="pulse-dot"></span><span>LIVE MARKETPLACE</span><span class="hero-eyebrow-sep">/</span><span>FAST ACTIVATIONS</span></div>
      <h1>Get a number. Get your code. Keep moving.</h1>
      <p>Pick a service and track the activation from one focused workspace. Server and slot allocation stay automatic.</p>
      <div class="hero-actions">
        <button class="primary-btn hero-primary" type="button" data-page="buy">Browse services <span>→</span></button>
        <button class="ghost-btn" type="button" data-page="wallet">Add funds <span>+</span></button>
      </div>
    </div>
    <div class="hero-dashboard">
      <div class="hero-live"><span class="live-dot"></span><strong>Marketplace live</strong><span>24/7</span></div>
      <div class="hero-stat-grid">
        <div class="hero-stat"><span>Services</span><strong>${state.services.length.toLocaleString()}</strong><small>ready to browse</small></div>
        <div class="hero-stat"><span>Servers / service</span><strong>11</strong><small>distributed capacity</small></div>
        <div class="hero-stat"><span>Code timing</span><strong>20s</strong><small>automatic delivery</small></div>
        <div class="hero-stat"><span>Active now</span><strong>${activeCount}</strong><small>${activeCount === 1 ? 'activation' : 'activations'}</small></div>
      </div>
    </div>
  </section>`;
}

function content() {
  if (state.loading) return `<div class="panel" style="padding:30px;color:#8995a7">Loading service catalog…</div>`;
  if (state.page === 'active') return activePage();
  if (state.page === 'orders') return ordersPage();
  if (state.page === 'wallet') return walletPage();
  if (state.page === 'api') return apiPage();
  if (state.page === 'admin') return adminPage();
  return buyPage();
}



function serviceCard(service) {
  const availability = Math.max(0, Number(service.stock || 0));
  const availabilityState = availability <= 0 ? 'sold-out' : availability < 100 ? 'limited' : 'ready';
  const availabilityLabel = availability <= 0 ? 'Sold out' : availability < 100 ? 'Limited' : 'Ready';
  const disabled = availability <= 0 || state.balancePaise < Number(service.pricePaise || 0);
  const actionLabel = availability <= 0 ? 'Unavailable' : state.balancePaise < Number(service.pricePaise || 0) ? 'Top up' : 'Buy number';
  return `<article class="market-service-group customer-service-card">
    <div class="customer-service-main">
      <span class="service-icon service-brand-icon">${iconFor(service.category)}</span>
      <span class="service-group-copy">
        <span class="service-category">${esc(service.category)}</span>
        <strong>${esc(service.name)}</strong>
        <small>India (+91) · Fast activation · ~20s OTP</small>
      </span>
      <span class="service-group-meta">
        <span class="availability-pill ${availabilityState}"><span></span>${availabilityLabel}</span>
        <span class="service-price">${money(service.pricePaise)}</span>
      </span>
    </div>
    <div class="customer-service-bottom">
      <span class="customer-service-fact"><b>3 min</b> activation window</span>
      <span class="customer-service-fact"><b>${availability.toLocaleString()}</b> available</span>
      <button class="buy-btn customer-buy" type="button" data-buy-service="${esc(service.id)}" ${disabled && availability > 0 ? '' : (availability <= 0 ? 'disabled aria-disabled="true"' : '')}>${actionLabel}</button>
    </div>
  </article>`;
}

function marketListMarkup(list) {
  const visible = list.slice(0, state.marketVisibleCount);
  const loadMore = visible.length < list.length;
  return `${visible.length ? visible.map(serviceCard).join("") : '<div class="market-empty panel"><div class="empty-icon">⌕</div><h3>No services match</h3><p>Try a different service name or category.</p></div>'}
  ${loadMore ? `<div class="market-load-more-wrap"><button class="load-more-btn" type="button" data-load-more>Load more <span>${visible.length.toLocaleString()} / ${list.length.toLocaleString()}</span></button></div>` : ""}`;
}

function renderBuyCatalog() {
  const root = document.getElementById("content");
  if (!root || state.page !== "buy") return;
  const list = filteredMarketServices();
  const grid = root.querySelector(".service-grid");
  const result = root.querySelector(".market-result-count");
  const purchaseRoot = root.querySelector(".purchase-flow-root");
  if (grid) grid.innerHTML = marketListMarkup(list);
  if (purchaseRoot) purchaseRoot.innerHTML = purchaseReviewModal();
  if (result) result.textContent = marketResultText(list.length, Math.min(state.marketVisibleCount, list.length));
  syncOverlayScrollLock();
  root.querySelectorAll("[data-category]").forEach((node) => {
    node.classList.toggle("selected", node.dataset.category === state.category);
    node.setAttribute("aria-pressed", String(node.dataset.category === state.category));
  });
}

function buyPage() {
  const list = filteredMarketServices();
  const showing = Math.min(state.marketVisibleCount, list.length);
  return `<div class="market-page">
    <div class="section-head market-section-head">
      <div><span class="kicker">MARKETPLACE / INDIA</span><h2>Choose a service</h2><p class="section-subcopy">Pick the service you need. INBOX9 automatically handles number allocation behind the scenes.</p></div>
      <div class="market-summary"><span class="summary-dot"></span><strong>${list.length.toLocaleString()}</strong><span>matches</span></div>
    </div>
    <div class="market-country-strip"><div class="market-country-pill"><span class="country-flag">IN</span><div><strong>India (+91)</strong><small>Current market</small></div></div><div class="country-note">Server and slot allocation are automatic</div></div>
    <div class="controls market-controls">
      <div class="toolbar market-toolbar">
        <label class="search-box premium-search" aria-label="Search services"><span class="search-glyph">⌕</span><input id="service-search" value="${esc(state.search)}" placeholder="Search ${state.services.length.toLocaleString()} services…" autocomplete="off" spellcheck="false"><kbd>/</kbd></label>
        <div class="category-scroll-wrap"><div class="category-scroll" role="group" aria-label="Service categories">${categories.map((category) => `<button class="filter-btn ${state.category === category ? "selected" : ""}" type="button" data-category="${category}" aria-pressed="${state.category === category}"><span>${category}</span><span class="filter-count">${(state.categoryCounts[category] || 0).toLocaleString()}</span></button>`).join("")}</div></div>
      </div>
    </div>
    <div class="market-results-bar"><span class="result-note market-result-count" aria-live="polite">${esc(marketResultText(list.length, showing))}</span><span class="market-hint">Prices and availability update from the INBOX9 backend</span></div>
    <div class="service-grid customer-service-grid">${marketListMarkup(list)}</div>
    <div class="purchase-flow-root">${purchaseReviewModal()}</div>
  </div>`;
}
function activePage() {
  return `<div class="section-head with-action"><div><span class="kicker">LIVE SESSION</span><h2>Active numbers</h2></div><span class="status-chip">● ${state.active.length} active</span></div>${state.active.length ? `<div class="active-list">${state.active.map(activeCard).join('')}</div>` : `<div class="panel empty"><div class="empty-icon">▤</div><h3>No active numbers</h3><p>Reserve a number from the marketplace and the activation will appear here.</p></div>`}`;
}

function renderActiveOnly() {
  const node = document.getElementById('content');
  if (node) node.innerHTML = activePage();
  bindEvents();
}

function activeCard(activation) {
  const remaining = Math.max(0, Math.floor((activation.expiresAt - Date.now()) / 1000));
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');
  const progress = Math.min(100, Math.max(0, (remaining / 180) * 100));
  const completed = activation.status === 'Completed';
  return `<article class="active-card ${completed ? 'completed' : ''}">
    <div class="active-card-header">
      <div class="service-icon large">${iconFor(state.services.find((s) => s.id === activation.serviceId)?.category)}</div>
      <div class="service-meta"><span class="service-category">${esc(activation.service)}</span><h3>${esc(activation.number)}</h3></div>
      <span class="activation-status">${completed ? '✓ OTP received' : '↻ Waiting SMS'}</span>
    </div>
    <div class="active-context"><span>India (+91)</span><span>${money(activation.pricePaise)}</span><span>Order ${esc(activation.id)}</span></div>
    ${completed ? `<div class="otp-panel"><div class="otp-label">VERIFICATION CODE</div><div class="otp-code">${esc(activation.otp)}</div><button class="copy-btn" type="button" data-copy="${esc(activation.otp.replace(/\\s/g, ''))}">⧉ Copy OTP</button></div>` : `<div class="otp-panel"><div class="otp-label">TIME REMAINING</div><div class="timer">◷ ${minutes}:${seconds}</div><div class="progress"><span style="width:${progress}%"></span></div><div class="waiting-note">▣ Your verification code will appear here automatically</div></div>`}
    <div class="active-footer"><span>Temporary number</span>${!completed ? `<button class="text-danger" type="button" data-cancel="${esc(activation.id)}">Cancel & refund</button>` : '<span>Verification complete</span>'}</div>
  </article>`;
}

function ordersPage() {
  return `<div class="section-head"><div><span class="kicker">ACCOUNT ACTIVITY</span><h2>Order history</h2></div><span class="result-note">${state.orders.length} records</span></div><div class="panel table-panel"><table class="orders-table"><thead><tr><th>Order</th><th>Service</th><th>Number</th><th>Status</th><th>OTP</th><th>Price</th><th>Created</th></tr></thead><tbody>${state.orders.map((order) => `<tr><td class="mono" data-label="Order">${esc(order.id)}</td><td data-label="Service"><strong>${esc(order.service)}</strong></td><td data-label="Number">${esc(order.number)}</td><td data-label="Status"><span class="table-status ${order.status.toLowerCase()}">${esc(order.status)}</span></td><td data-label="OTP">${esc(order.otp)}</td><td data-label="Price">${money(order.pricePaise)}</td><td data-label="Created">${esc(order.created)}</td></tr>`).join('')}</tbody></table></div>`;
}
function walletPage() {
  const returnPurchase = state.purchaseFlow.returnAfterWallet && state.purchaseFlow.serviceId
    ? '<div class="panel purchase-return-banner"><div><strong>Continue your activation</strong><span>Your selected service is saved.</span></div><button class="primary-btn" type="button" data-return-purchase>Back to purchase</button></div>'
    : '';
  const ledgerRows = state.walletLedger.length ? state.walletLedger.map(entry => `<div class="ledger-row ${entry.type === 'credit' ? 'positive' : ''}"><span>${entry.type === 'credit' ? '↘' : '↗'} ${esc(entry.description)}</span><strong>${entry.type === 'credit' ? '+' : '−'} ${money(entry.amountPaise)}</strong><small>${new Date(entry.createdAt).toLocaleString()}</small></div>`).join('') : '<div class="empty-mini">No wallet transactions yet.</div>';
  const rechargeRows = state.recharges.length ? state.recharges.map(item => `<div class="recharge-row"><div><strong>${money(item.amountPaise)}</strong><span class="table-status ${item.status.toLowerCase()}">${esc(item.status)}</span></div><code>${esc(item.utr)}</code><small>${new Date(item.submittedAt).toLocaleString()}</small></div>`).join('') : '<div class="empty-mini">No recharge requests yet.</div>';
  const rechargeReady = Boolean(state.persistentState && state.rechargeUpiId);
  const fundingPanel = rechargeReady
    ? `<div class="recharge-grid">
      <div class="panel payment-panel"><div class="panel-head"><div><h3>1. Pay by UPI</h3><span>Use the configured INBOX9 payment destination.</span></div><span class="status-chip">MANUAL VERIFY</span></div><div class="upi-row"><span>UPI ID</span><code>${esc(state.rechargeUpiId)}</code><button class="copy-btn" type="button" data-copy="${esc(state.rechargeUpiId)}">Copy</button></div></div>
      <div class="panel payment-panel"><div class="panel-head"><div><h3>2. Submit payment</h3><span>Use the exact amount you paid and its UTR.</span></div></div><form id="recharge-form" class="recharge-form"><label>Amount (₹)<input id="recharge-amount" name="amount" type="number" min="100" max="5000" step="1" value="${state.rechargeAmount}" required></label><div class="amount-presets">${[100,500,1000,2000,5000].map(amount => `<button type="button" class="filter-btn ${state.rechargeAmount === amount ? 'selected' : ''}" data-recharge-amount="${amount}">₹${amount}</button>`).join('')}</div><label>UTR / Transaction reference<input name="utr" type="text" minlength="4" maxlength="64" autocomplete="off" placeholder="Enter UTR after payment" required></label><button class="primary-btn" type="submit">Submit recharge for verification</button><p class="form-note">Do not submit a UTR until the UPI payment is successful. Duplicate UTRs are rejected.</p></form></div>
    </div>`
    : `<div class="panel payment-panel"><div class="panel-head"><div><h3>Wallet funding unavailable</h3><span>${state.persistentState ? 'Recharge is not configured on this deployment yet.' : 'Synthetic QA mode never accepts real payments.'}</span></div><span class="status-chip">${state.persistentState ? 'SETUP REQUIRED' : 'SYNTHETIC MODE'}</span></div><p class="form-note">Your account starts at ₹0.00. No fake balance or fake payment credit is created in the browser or server runtime.</p></div>`;
  return `${returnPurchase}<div class="section-head"><div><span class="kicker">WALLET / INR</span><h2>Recharge & Wallet</h2></div><span class="result-note">Min ₹100 · Max ₹5,000</span></div>
    <div class="wallet-grid">
      <div class="balance-card"><div class="wallet-card-top"><span>AVAILABLE BALANCE</span><span>INR</span></div><strong>${money(state.balancePaise)}</strong><small>Balance comes from the authoritative INBOX9 wallet service.</small></div>
      <div class="panel wallet-info"><div class="info-icon">₹</div><div><h3>Recharge before buying numbers</h3><p>${rechargeReady ? 'Pay by UPI, then submit your UTR. Your balance is credited only after an authorized verification.' : 'Wallet funding is unavailable until persistent accounting and payment configuration are enabled.'}</p></div></div>
    </div>
    ${fundingPanel}
    <div class="panel ledger"><div class="panel-head"><div><h3>Recharge requests</h3><span>Pending requests are not credited until verified.</span></div></div>${rechargeRows}</div>
    <div class="panel ledger"><div class="panel-head"><div><h3>Wallet ledger</h3><span>Authoritative account activity</span></div></div>${ledgerRows}</div>`;
}

function apiPage() {
  return `<div class="section-head"><div><span class="kicker">OPERATIONS</span><h2>API foundation</h2></div><span class="status-chip">ADMIN ONLY</span></div><div class="api-grid"><div class="panel api-card"><div class="api-title"><div class="info-icon">ϟ</div><div><h3>Provider adapter contract</h3><p>Upstream integrations stay behind a server-only adapter and never leak provider credentials to the browser.</p></div></div><pre>interface ProviderAdapter {
  listServices(): Promise&lt;Service[]&gt;
  reserveNumber(input): Promise&lt;Activation&gt;
  getActivation(id): Promise&lt;Activation&gt;
  cancelActivation(id): Promise&lt;Refund&gt;
}</pre></div><div class="panel api-card"><div class="api-title"><div class="info-icon">⌘</div><div><h3>HTTP surface</h3><p>Production auth, rate limiting, idempotency and persistence sit in front of these routes.</p></div></div>${[['GET','/api/health'],['POST','/api/auth/change-password'],['POST','/api/auth/logout-all'],['GET','/api/services'],['GET','/api/wallet'],['POST','/api/recharges'],['GET','/api/activations'],['POST','/api/activations'],['GET','/api/activations/:id'],['POST','/api/activations/:id/cancel'],['GET','/api/admin/overview'],['GET','/api/admin/recharges'],['POST','/api/admin/recharges/:id'],['GET','/api/admin/services'],['PATCH','/api/admin/services/:id'],['GET','/api/admin/users'],['GET','/api/admin/activations'],['GET','/api/admin/ledger'],['GET','/api/admin/providers'],['GET','/api/admin/providers-health'],['GET','/api/admin/audit']].map(([method, path]) => `<div class="endpoint"><span class="method ${method.toLowerCase()}">${method}</span><code>${path}</code><span>↗</span></div>`).join('')}</div></div>`;
}

function bindEvents() {
  document.getElementById('auth-form')?.addEventListener('submit', submitAuth);
  document.querySelectorAll('[data-auth-mode]').forEach((node) => node.addEventListener('click', () => { state.authMode = node.dataset.authMode; render(); }));
  document.querySelectorAll('[data-action="logout"]').forEach((node) => node.addEventListener('click', logout));
  document.querySelectorAll('[data-action="security"]').forEach((node) => node.addEventListener('click', openSecurity));
  document.querySelectorAll('[data-action="close-security"]').forEach((node) => node.addEventListener('click', closeSecurity));
  document.querySelectorAll('[data-action="logout-all"]').forEach((node) => node.addEventListener('click', logoutAll));
  document.getElementById('change-password-form')?.addEventListener('submit', submitChangePassword);
  document.querySelectorAll('[data-page]').forEach((node) => node.addEventListener('click', () => setPage(node.dataset.page)));
  bindMarketplaceEvents();
  document.querySelectorAll('[data-cancel]').forEach((node) => node.addEventListener('click', () => cancelActivation(node.dataset.cancel)));
  document.querySelectorAll('[data-copy]').forEach((node) => node.addEventListener('click', async () => { try { await navigator.clipboard.writeText(node.dataset.copy); toast('OTP copied'); } catch { toast('Copy unavailable on this browser'); } }));
  document.querySelectorAll('[data-action="open-menu"]').forEach((node) => node.addEventListener('click', openMenu));
  document.querySelectorAll('[data-action="close-menu"]').forEach((node) => node.addEventListener('click', closeMenu));
  document.querySelectorAll('[data-action="reset"]').forEach((node) => node.addEventListener('click', resetDemo));
  document.getElementById('recharge-form')?.addEventListener('submit', submitRecharge);
  document.querySelectorAll('[data-admin-tab]').forEach((node) => node.addEventListener('click', () => loadAdminTab(node.dataset.adminTab)));
  document.querySelectorAll('[data-admin-approve]').forEach((node) => node.addEventListener('click', () => {
    const row = node.closest('tr');
    const verifiedAmount = row?.querySelector('[data-admin-verified-amount]')?.value;
    const verifiedUtr = row?.querySelector('[data-admin-verified-utr]')?.value;
    const externalReference = row?.querySelector('[data-admin-external-reference]')?.value;
    adminAction(`/api/admin/recharges/${encodeURIComponent(node.dataset.adminApprove)}`, {
      decision: 'approve', verifiedAmount, verifiedUtr, externalReference
    });
  }));
  document.querySelectorAll('[data-admin-reject]').forEach((node) => node.addEventListener('click', () => { const reason = window.prompt('Reason for rejecting this recharge?', 'Payment could not be verified'); if (reason !== null) adminAction(`/api/admin/recharges/${encodeURIComponent(node.dataset.adminReject)}`, { decision: 'reject', reason }); }));
  document.querySelectorAll('[data-admin-service-form]').forEach((node) => node.addEventListener('submit', (event) => { event.preventDefault(); adminUpdateService(node.dataset.adminServiceForm, node); }));
  document.querySelectorAll('[data-recharge-amount]').forEach((node) => node.addEventListener('click', () => setRechargeAmount(node.dataset.rechargeAmount)));
}

function bindMarketplaceEvents() {
  const root = document.getElementById("content");
  if (!root || root.dataset.marketBound === "true") return;
  root.dataset.marketBound = "true";
  root.addEventListener("input", (event) => {
    if (event.target?.id === "service-search") scheduleMarketSearch(event.target.value);
  });
  root.addEventListener("click", (event) => {
    const category = event.target.closest("[data-category]");
    if (category && root.contains(category)) {
      window.clearTimeout(state.marketSearchTimer);
      state.category = category.dataset.category;
      state.marketVisibleCount = MARKET_PAGE_SIZE;
      state.expandedServiceId = null;
      renderBuyCatalog();
      return;
    }
    const loadMore = event.target.closest("[data-load-more]");
    if (loadMore && root.contains(loadMore)) {
      const list = filteredMarketServices();
      state.marketVisibleCount = Math.min(state.marketVisibleCount + MARKET_PAGE_SIZE, list.length);
      renderBuyCatalog();
      return;
    }
    const buyButton = event.target.closest("[data-buy-service]");
    if (buyButton && root.contains(buyButton)) {
      openPurchaseReview(buyButton.dataset.buyService);
      return;
    }

    const purchaseClose = event.target.closest("[data-purchase-close]");
    if (purchaseClose && root.contains(purchaseClose)) {
      closePurchaseReview();
      return;
    }

    const purchaseConfirm = event.target.closest("[data-purchase-confirm]");
    if (purchaseConfirm && root.contains(purchaseConfirm)) {
      void confirmPurchase();
      return;
    }

    const purchaseWallet = event.target.closest("[data-purchase-wallet]");
    if (purchaseWallet && root.contains(purchaseWallet)) {
      state.purchaseFlow.returnAfterWallet = true;
      state.page = 'wallet';
      render();
      return;
    }

    const returnPurchase = event.target.closest("[data-return-purchase]");
    if (returnPurchase) {
      const serviceId = state.purchaseFlow.serviceId;
      state.purchaseFlow.returnAfterWallet = false;
      state.page = 'buy';
      state.expandedServiceId = serviceId;
      render();
      scheduleDialogFocus();
    }
  });
}
document.addEventListener('keydown', (event) => {
  const dialog = activeDialog();
  if (dialog) {
    if (event.key === 'Escape') {
      if (state.securityOpen) closeSecurity();
      else if (state.purchaseFlow.step === 'review' && !state.purchaseFlow.submitting) closePurchaseReview();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = focusableInDialog(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    return;
  }
  if (event.key === '/' &&
      !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) &&
      window.matchMedia('(pointer: fine)').matches) {
    event.preventDefault();
    document.getElementById('service-search')?.focus();
  }
});

boot();