import { createCustomerState, NAV, DEFAULT_CATEGORIES, MARKET_PAGE_SIZE, MARKET_MAX_SEARCH_RESULTS } from './customer/state.js';
import { api } from './customer/api-client.js';
import { esc, money, iconFor, isLiveActivation, normalizeSearchText } from './customer/ui.js';
import { createCustomerNavigation } from './customer/navigation.js';
import { createCustomerDataController } from './customer/customer-data.js';

const CLIENT_ERROR_MAX_REPORTS = 20;
const reportedClientErrors = new Map();

const SESSION_HINT_KEY = 'inbox9.session-hint.v1';

function readSessionHint() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_HINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.user || typeof parsed.user.email !== 'string') return null;
    return {
      user: {
        id: String(parsed.user.id || ''),
        email: String(parsed.user.email || '').trim().toLowerCase(),
        role: parsed.user.role === 'admin' ? 'admin' : 'user',
        displayName: String(parsed.user.displayName || ''),
        createdAt: Number(parsed.user.createdAt || 0)
      }
    };
  } catch {
    return null;
  }
}

function writeSessionHint(user) {
  if (!user?.email) return;
  try {
    window.sessionStorage.setItem(SESSION_HINT_KEY, JSON.stringify({
      user: {
        id: String(user.id || ''),
        email: String(user.email || '').trim().toLowerCase(),
        role: user.role === 'admin' ? 'admin' : 'user',
        displayName: String(user.displayName || ''),
        createdAt: Number(user.createdAt || 0)
      }
    }));
  } catch {
    // Session UI hint is optional; authentication remains server-authoritative.
  }
}

function clearSessionHint() {
  try { window.sessionStorage.removeItem(SESSION_HINT_KEY); } catch {}
}

function clientErrorFingerprint(name, message, source) {
  return [name, message, source].map((value) => String(value || '').slice(0, 180)).join('|');
}

function reportClientError(payload = {}) {
  const name = String(payload.name || 'BrowserError').slice(0, 120);
  const message = String(payload.message || 'Unknown browser error').slice(0, 1000);
  const source = String(payload.source || 'browser').slice(0, 100);
  if (!message) return;
  const fingerprint = clientErrorFingerprint(name, message, source);
  const now = Date.now();
  for (const [key, seenAt] of reportedClientErrors) {
    if (now - seenAt > 10 * 60 * 1000) reportedClientErrors.delete(key);
  }
  if (reportedClientErrors.has(fingerprint) || reportedClientErrors.size >= CLIENT_ERROR_MAX_REPORTS) return;
  reportedClientErrors.set(fingerprint, now);
  const path = window.location.pathname || '/';
  const stack = String(payload.stack || '').slice(0, 8000);
  void fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    keepalive: true,
    body: JSON.stringify({ name, message, stack, path, source })
  }).catch(() => {});
}

window.addEventListener('error', (event) => {
  const error = event.error;
  if (error instanceof Error) {
    reportClientError({ name: error.name, message: error.message, stack: error.stack, source: 'window.error' });
    return;
  }
  const target = event.target;
  const resource = target?.src || target?.href || '';
  reportClientError({
    name: 'ResourceLoadError',
    message: resource ? 'Resource failed to load' : String(event.message || 'Browser error'),
    stack: '',
    source: 'window.error'
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'Unhandled promise rejection'));
  reportClientError({ name: reason.name, message: reason.message, stack: reason.stack, source: 'unhandledrejection' });
});

const state = createCustomerState();

function appNav() {
  return state.user?.role === 'admin'
    ? [...NAV, ['admin', 'Admin', '⚙'], ['api', 'API', 'ϟ']]
    : NAV;
}

function prepareServiceCatalog() {
  const services = Array.isArray(state.services) ? state.services : [];
  const categoryCounts = services.reduce((counts, service) => {
    const category = String(service.category || 'Other').trim() || 'Other';
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
  const discoveredCategories = Object.keys(categoryCounts);
  const orderedCategories = [
    ...DEFAULT_CATEGORIES.filter((category) => categoryCounts[category] > 0),
    ...discoveredCategories.filter((category) => !DEFAULT_CATEGORIES.includes(category))
      .sort((a, b) => categoryCounts[b] - categoryCounts[a] || a.localeCompare(b))
  ];
  state.catalogCategories = ['All', ...orderedCategories];
  if (!state.catalogCategories.includes(state.category)) state.category = 'All';
  state.serviceSearchIndex = services.map((service) => ({ service, text: normalizeSearchText(service.name) }));
  state.categoryCounts = state.catalogCategories.reduce((counts, category) => {
    counts[category] = category === 'All' ? services.length : Number(categoryCounts[category] || 0);
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

function recentlyUsedServices() {
  const seen = new Set();
  const recent = [];
  for (const order of Array.isArray(state.orders) ? state.orders : []) {
    const service = state.services.find((item) =>
      (order.serviceId && item.id === order.serviceId) ||
      (!order.serviceId && item.name === order.service)
    );
    if (!service || seen.has(service.id)) continue;
    seen.add(service.id);
    recent.push(service);
    if (recent.length >= 6) break;
  }
  return recent;
}

function readMarketplaceUrlState() {
  const params = new URLSearchParams(window.location.search);
  const search = String(params.get('search') || '').trim();
  const category = String(params.get('category') || '').trim();
  return { search, category: category || 'All' };
}

function syncMarketplaceUrlState({ replace = true } = {}) {
  const url = new URL(window.location.href);
  const search = String(state.search || '').trim();
  const category = state.category && state.category !== 'All' ? state.category : '';
  if (search) url.searchParams.set('search', search);
  else url.searchParams.delete('search');
  if (category) url.searchParams.set('category', category);
  else url.searchParams.delete('category');
  const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') + url.hash;
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (next === current) return;
  if (replace) window.history.replaceState({ ...window.history.state, market: true }, '', next);
  else window.history.pushState({ ...window.history.state, market: true }, '', next);
}

function restoreMarketplaceUrlState() {
  const urlState = readMarketplaceUrlState();
  state.search = urlState.search;
  state.category = urlState.category;
  state.marketVisibleCount = state.search ? MARKET_MAX_SEARCH_RESULTS : MARKET_PAGE_SIZE;
  state.expandedServiceId = null;
}

function handleMarketplaceUrlNavigation() {
  const before = `${state.search}|${state.category}`;
  const urlState = readMarketplaceUrlState();
  const after = `${urlState.search}|${urlState.category}`;
  if (before === after) return;
  restoreMarketplaceUrlState();
  if (state.page === 'buy') render();
}

function hasActiveMarketplaceFilters() {
  return Boolean(String(state.search || '').trim() || (state.category && state.category !== 'All'));
}

function scheduleMarketSearch(value) {
  state.search = value;
  window.clearTimeout(state.marketSearchTimer);
  window.clearTimeout(state.marketUrlSyncTimer);
  state.marketUrlSyncTimer = window.setTimeout(() => syncMarketplaceUrlState({ replace: true }), 120);
  state.marketSearchTimer = window.setTimeout(() => {
    state.marketVisibleCount = state.search ? MARKET_MAX_SEARCH_RESULTS : MARKET_PAGE_SIZE;
    state.expandedServiceId = null;
    renderBuyCatalog();
  }, 60);
}

function clearMarketplaceFilters() {
  window.clearTimeout(state.marketSearchTimer);
  window.clearTimeout(state.marketUrlSyncTimer);
  state.search = '';
  state.category = 'All';
  state.marketVisibleCount = MARKET_PAGE_SIZE;
  state.expandedServiceId = null;
  syncMarketplaceUrlState({ replace: true });
  renderBuyCatalog();
}


function notificationSnapshot() {
  return {
    recharges: new Map((state.recharges || []).map((item) => [item.id, {
      status: String(item.status || 'Pending'),
      amountPaise: Number(item.amountPaise || 0),
      rejectionReason: item.rejectionReason || ''
    }])),
    activations: new Map((state.orders || []).map((item) => [item.id, {
      status: String(item.status || ''),
      otp: String(item.otp || '')
    }])),
    support: new Map((state.supportTickets || []).map((item) => [item.id, {
      status: String(item.status || 'Open'),
      adminNote: String(item.adminNote || ''),
      subject: String(item.subject || '')
    }]))
  };
}

let notificationBaseline = null;
let supportSyncInFlight = false;

const NOTIFICATION_POPUP_DURATION_MS = 5_000;

function notificationPopupKey(notification = {}) {
  const sourceType = String(notification.sourceType || notification.kind || '').trim();
  const sourceId = String(notification.sourceId || '').trim();
  const eventKey = String(notification.eventKey || '').trim();
  return sourceType && sourceId && eventKey ? sourceType + ':' + sourceId + ':' + eventKey : '';
}

function notificationIsPopupSuppressed(item) {
  const key = notificationPopupKey(item);
  if (!key) return false;
  const current = notificationPopupKey(state.notificationPopup || {});
  if (current && current === key) return true;
  return (state.notificationPopupQueue || []).some((queued) => notificationPopupKey(queued) === key);
}

function renderNotificationPopup() {
  const popup = state.notificationPopup;
  if (!popup) return '';
  return '<div class="notification-popup" role="status" aria-live="polite" aria-atomic="true">' +
    '<div class="notification-popup-icon ' + esc(popup.tone || 'info') + '">' + (popup.tone === 'danger' ? '!' : '✓') + '</div>' +
    '<div class="notification-popup-copy"><strong>' + esc(popup.title) + '</strong><span>' + esc(popup.body) + '</span></div>' +
  '</div>';
}

function pumpNotificationPopupQueue() {
  if (state.notificationPopup || !(state.notificationPopupQueue || []).length) return;
  const now = Date.now();
  state.notificationPopupQueue.sort((a, b) => Number(a.showAt || 0) - Number(b.showAt || 0));
  const next = state.notificationPopupQueue[0];
  const wait = Math.max(0, Number(next.showAt || 0) - now);
  window.clearTimeout(state.notificationPopupTimer);
  state.notificationPopupTimer = window.setTimeout(() => {
    state.notificationPopupTimer = null;
    const currentNow = Date.now();
    const index = state.notificationPopupQueue.findIndex((item) => Number(item.showAt || 0) <= currentNow);
    if (index < 0) return pumpNotificationPopupQueue();
    state.notificationPopup = state.notificationPopupQueue.splice(index, 1)[0];
    render();
    state.notificationPopupTimer = window.setTimeout(() => {
      state.notificationPopup = null;
      window.clearTimeout(state.notificationPopupTimer);
      state.notificationPopupTimer = null;
      render();
      void refreshNotifications().then(() => render());
      pumpNotificationPopupQueue();
    }, NOTIFICATION_POPUP_DURATION_MS);
  }, wait);
}

function queueNotificationPopup({ title, body, page = null, tone = 'info', sourceType = '', sourceId = '', eventKey = '', delayMs = 0 }) {
  const entry = {
    title, body, page, tone,
    sourceType, sourceId, eventKey,
    showAt: Date.now() + Math.max(0, Number(delayMs) || 0)
  };
  const key = notificationPopupKey(entry);
  if (key) {
    const duplicate = notificationPopupKey(state.notificationPopup || {}) === key ||
      (state.notificationPopupQueue || []).some((item) => notificationPopupKey(item) === key);
    if (duplicate) return;
  }
  state.notificationPopupQueue = [...(state.notificationPopupQueue || []), entry];
  pumpNotificationPopupQueue();
}

function addNotification({ title, body, page = null, tone = 'info' }) {
  state.notifications = [{
    id: state.notificationsNextId++,
    title, body, page, tone,
    createdAt: Date.now(),
    read: false
  }, ...state.notifications].slice(0, 30);
}

function processNotificationSnapshot({ announce = true } = {}) {
  const current = notificationSnapshot();
  if (!notificationBaseline) {
    notificationBaseline = current;
    return;
  }
  if (announce) {
    for (const [id, next] of current.recharges) {
      const previous = notificationBaseline.recharges.get(id);
      if (!previous || previous.status === next.status) continue;
      if (next.status === 'Approved') {
        queueNotificationPopup({
          title: 'Recharge successful',
          body: money(next.amountPaise) + ' has been credited to your wallet.',
          page: 'wallet',
          tone: 'success',
          sourceType: 'recharge',
          sourceId: id,
          eventKey: 'status:Approved'
        });
      } else if (next.status === 'Rejected') {
        addNotification({
          title: 'Recharge rejected',
          body: next.rejectionReason || 'Your payment could not be verified.',
          page: 'wallet',
          tone: 'danger'
        });
      }
    }
    for (const [id, next] of current.activations) {
      const previous = notificationBaseline.activations.get(id);
      if (!previous) continue;
      const otpChanged = next.otp && !['Waiting…', '—'].includes(next.otp) && ['Waiting…', '—'].includes(previous.otp);
      if (otpChanged) {
        queueNotificationPopup({
          title: 'OTP received successfully',
          body: 'Your verification code is ready for order ' + id + '.',
          page: 'active',
          tone: 'success',
          sourceType: 'activation',
          sourceId: id,
          eventKey: 'status:Completed'
        });
      } else if (previous.status !== next.status && next.status === 'Expired') {
        addNotification({
          title: 'Number expired',
          body: 'Order ' + id + ' reached its validity limit.',
          page: 'orders'
        });
      } else if (previous.status !== next.status && (next.status === 'Refunded' || next.status === 'Cancelled')) {
        addNotification({
          title: 'Activation closed',
          body: 'Order ' + id + ' is now ' + next.status.toLowerCase() + '.',
          page: 'orders'
        });
      }
    }
    for (const [id, next] of current.support) {
      const previous = notificationBaseline.support.get(id);
      if (!previous) continue;
      if (previous.status !== next.status) {
        addNotification({
          title: 'Support ticket updated',
          body: next.subject + ' • Status: ' + next.status + '.',
          page: 'support',
          tone: next.status === 'Resolved' ? 'success' : 'info'
        });
      } else if (previous.adminNote !== next.adminNote && next.adminNote) {
        addNotification({
          title: 'Support note added',
          body: next.subject + ' has a new response from support.',
          page: 'support',
          tone: 'success'
        });
      }
    }
  }
  notificationBaseline = current;
}

async function refreshNotifications(){if(!state.user)return null;state.notificationLoading=true;try{const payload=await api('/api/notifications');state.notifications=Array.isArray(payload.notifications)?payload.notifications:[];state.notificationError='';return payload;}catch(error){if(Number(error.status)===401){handleSessionExpired();return null;}state.notificationError=error.message||'Notifications unavailable';return null;}finally{state.notificationLoading=false;}}
async function markNotificationRead(id){if(!id)return;try{await api('/api/notifications/'+encodeURIComponent(id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({read:true})});}catch(error){toast(error.message);}}
async function markAllNotificationsRead(){try{await api('/api/notifications/read-all',{method:'POST'});state.notifications=state.notifications.map(i=>({...i,read:true}));state.notificationsOpen=false;render();}catch(error){toast(error.message);}}
function openNotifications(){state.notificationsOpen=!state.notificationsOpen;if(state.notificationsOpen)void refreshNotifications().then(()=>render());else render();}
function closeNotifications(){if(!state.notificationsOpen)return;state.notificationsOpen=false;render();}

function notificationPanel() {
  const visibleNotifications = state.notifications.filter((item) => !notificationIsPopupSuppressed(item));
  const unread = visibleNotifications.filter((item) => !item.read).length;
  const rows = visibleNotifications.length
    ? visibleNotifications.map((item) => {
        const elapsed = Math.max(0, Math.floor((Date.now() - item.createdAt) / 1000));
        const age = elapsed < 60 ? 'Just now' : elapsed < 3600 ? Math.floor(elapsed / 60) + 'm ago' : Math.floor(elapsed / 3600) + 'h ago';
        return '<button class="notification-row ' + esc(item.tone) + ' ' + (item.read ? 'read' : 'unread') + '" type="button" data-notification-page="' + esc(item.page || '') + '" data-notification-id="' + esc(item.id) + '">' +
          '<span class="notification-icon">•</span><span class="notification-copy"><strong>' + esc(item.title) + '</strong><small>' + esc(item.body) + '</small><em>' + age + '</em></span></button>';
      }).join('')
    : '<div class="notification-empty"><span>✓</span><strong>All caught up</strong><small>Important wallet and activation updates will appear here.</small></div>';
  return '<div class="notification-wrap ' + (unread ? 'has-unread' : '') + '"><button class="icon-btn notification-btn" type="button" aria-label="' + (unread ? 'Notifications, ' + unread + ' unread' : 'Notifications') + '" aria-expanded="' + String(state.notificationsOpen) + '" aria-controls="customer-notification-panel" data-action="notifications"><span class="notification-bell" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"></path></svg></span><span class="notification-status-light" aria-hidden="true"></span>' +
    (unread ? '<b class="notification-badge">' + unread + '</b>' : '') + '</button>' +
    (state.notificationsOpen ? '<div id="customer-notification-panel" class="notification-panel" role="dialog" aria-label="Notifications"><div class="notification-panel-head"><div><span class="kicker">UPDATES</span><strong>Notifications</strong></div><button class="ghost-btn" type="button" data-action="notifications-read" ' + (unread ? '' : 'disabled') + '>Mark read</button></div><div class="notification-list">' + rows + '</div></div>' : '') +
    '</div>';
}

function toast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  window.clearTimeout(state.toastTimer);
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.appendChild(node);
  state.toastTimer = window.setTimeout(() => {
    if (node.isConnected) node.remove();
    state.toastTimer = null;
  }, 2300);
}

function setRefreshUi(active, label = active ? 'Syncing' : 'Connected') {
  const status = document.querySelector('[data-global-sync]');
  if (status) {
    status.classList.toggle('syncing', active);
    status.classList.toggle('reconnecting', !active && state.reconnecting);
    const text = status.querySelector('span:last-child');
    if (text) text.textContent = state.reconnecting ? 'Reconnecting' : label;
  }
  document.querySelectorAll('[data-action="refresh-customer"]').forEach((button) => {
    button.disabled = Boolean(active);
    button.textContent = active ? 'Refreshing…' : 'Refresh';
  });
}

async function refreshCurrentCustomerPage() {
  const page = state.page;
  if (page === 'buy') return refreshCatalog({ silent: false });
  if (page === 'wallet') {
    const result = await refreshWallet();
    render();
    return result;
  }
  if (page === 'support') {
    const result = await refreshSupport();
    render();
    return result;
  }
  if (page === 'account') {
    const result = await refreshAccount();
    render();
    return result;
  }
  if (page === 'admin') return loadAdminTab(state.adminTab);
  if (page === 'api') return true;
  return loadCustomerData({ renderAfter: true });
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
  if (state.authMode === 'recover') {
    if(password!==String(data.get('confirm')||'')) return toast('Passwords do not match');
    try{const payload=await api('/api/auth/recover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,recoveryCode:String(data.get('recoveryCode')||''),password})});state.user=payload.user;state.sessionHint={user:payload.user};writeSessionHint(payload.user);state.authMode='login';state.page='buy';loadPersisted();await loadCustomerData();render();toast('Password reset. You are signed in.');return;}catch(error){toast(error.message);return;}
  }
  if (state.authMode === 'register' && password !== String(data.get('confirm') || '')) return toast('Passwords do not match');
  try {
    const endpoint = state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const payload = await api(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    state.user = payload.user;
    state.sessionHint = { user: payload.user };
    writeSessionHint(payload.user);
    state.page = pageFromHash();
    loadPersisted();
    await loadCustomerData();
    toast(state.authMode === 'register' ? 'Account created' : 'Signed in');
    render();
    if (!state.tickTimer) state.tickTimer = window.setInterval(tick, 1000);
  } catch (error) { toast(error.message); }
}


function openSecurity(){
  state.page = 'account';
  state.securityOpen = true;
  syncPageHash('account');
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
  clearSessionHint();
  state.sessionHint = null;
  notificationBaseline = null;
  state.authMode = 'login';
  state.notifications = [];
  state.notificationsOpen = false;
  state.notificationPopup = null;
  state.notificationPopupQueue = [];
  window.clearTimeout(state.notificationPopupTimer);
  state.notificationPopupTimer = null;
  state.user = null;
  state.active = [];
  state.recentActivations = [];
  state.activeCancelId = null;
  state.activeCancelBusy.clear();
  state.orders = [];
  state.walletLedger = [];
  state.recharges = [];
  state.walletSummary = { creditPaise: 0, debitPaise: 0, pendingPaise: 0, creditCount: 0, debitCount: 0, pendingCount: 0 };
  state.rechargeSubmitting = false;
  state.supportTickets = [];
  state.supportLoading = false;
  state.supportSubmitting = false;
  state.supportError = '';
  state.supportForm = { category: 'activation', subject: '', message: '', activationId: '', rechargeId: '' };
  state.orderFilter = 'all';
  state.expandedOrderId = null;
  state.securityOpen = false;
  state.expandedServiceId = null;
  resetPurchaseFlow();
  state.page = 'buy';
  syncPageHash('buy', { replace: true });
  render();
}

function serviceDetailsMarkup() {
  return '<div class="server-panel service-details-panel">' +
    '<div class="service-detail-row"><span class="service-detail-icon">◷</span><div><strong>Number validity</strong><span>Your reserved number remains valid for up to 25 minutes.</span></div></div>' +
    '<div class="service-detail-row"><span class="service-detail-icon">⌁</span><div><strong>OTP delivery</strong><span>Delivery timing varies by service. Watch the Active page for updates.</span></div></div>' +
  '</div>';
}

function toggleServiceDetails(serviceId) {
  state.expandedServiceId = state.expandedServiceId === serviceId ? null : serviceId;
  renderBuyCatalog();
}

async function bootstrapSession() {
  state.bootstrapError = '';
  state.loading = true;
  showStartupSplash();
  try {
    const session = await api('/api/auth/me');
    state.user = session.user;
    loadPersisted();
    await loadCustomerData();
    return true;
  } catch (error) {
    if (Number(error.status) === 401) {
      clearSessionHint();
      state.sessionHint = null;
      state.user = null;
      return false;
    }
    state.user = null;
    state.bootstrapError = error.code === 'NETWORK_ERROR' ? 'We could not reach INBOX9. Check your connection and try again.' : 'INBOX9 is temporarily unavailable. Please retry in a moment.';
    return false;
  } finally {
    state.loading = false;
    document.getElementById('app')?.setAttribute('aria-busy', 'false');
    render();
  }
}

async function retryBootstrap() {
  await bootstrapSession();
}

function handleConnectivityChange(){
  const online = navigator.onLine;
  const wasOffline = state.online === false;
  state.online = online;
  if (online && wasOffline && state.user) {
    state.reconnecting = true;
    setRefreshUi(true, 'Reconnecting');
    render();
    void loadCustomerData({silent:true}).finally(()=>{
      state.reconnecting = false;
      setRefreshUi(false, 'Connected');
      render();
      toast('Connection restored');
    });
  } else if (!online && state.user) {
    state.reconnecting = false;
    setRefreshUi(false, 'Offline');
    render();
    toast('You are offline. Live updates are paused.');
  }
}

async function boot() {
  state.page = pageFromHash();
  restoreMarketplaceUrlState();
  state.sessionHint = readSessionHint();
  if (state.sessionHint?.user) state.user = state.sessionHint.user;
  await bootstrapSession();
  if (!state.user) return;
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

const customerData = createCustomerDataController({
  state,
  api,
  isLiveActivation,
  prepareServiceCatalog,
  handleSessionExpired: (...args) => handleSessionExpired(...args),
  render,
  renderBuyCatalog
});

const {
  loadPersisted,
  persist,
  syncFromServerActivations,
  loadCustomerData: loadCustomerDataRaw,
  refreshCatalog
} = customerData;

const loadCustomerData = async (options = {}) => {
  const before = notificationSnapshot();
  const result = await loadCustomerDataRaw(options);
  if (result) {
    const hadBaseline = Boolean(notificationBaseline);
    notificationBaseline = before;
    processNotificationSnapshot({ announce: hadBaseline });
  }
  return result;
};

const {
  pageFromHash,
  syncPageHash,
  setPage,
  handleHashNavigation,
  handleSessionExpired
} = createCustomerNavigation({
  state,
  render,
  loadAdminTab,
  refreshWallet,
  refreshCatalog,
  refreshSupport,
  refreshAccount,
  resetPurchaseFlow,
  toast
});

async function waitForSupportSyncIdle() {
  while (supportSyncInFlight) {
    await new Promise((resolve) => window.setTimeout(resolve, 25));
  }
}

function mergeSupportTickets(incoming) {
  const merged = new Map((state.supportTickets || []).map((ticket) => [ticket.id, ticket]));
  for (const ticket of Array.isArray(incoming) ? incoming : []) {
    const current = merged.get(ticket.id);
    const incomingAt = Number(ticket.updatedAt || ticket.createdAt || 0);
    const currentAt = Number(current?.updatedAt || current?.createdAt || 0);
    if (!current || incomingAt >= currentAt) merged.set(ticket.id, ticket);
  }
  return [...merged.values()]
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
    .slice(0, 50);
}

async function refreshSupport({ announce = false, silent = false } = {}) {
  if (supportSyncInFlight) return null;
  supportSyncInFlight = true;
  if (!silent) {
    state.supportLoading = true;
    state.supportError = '';
  }
  const before = notificationSnapshot();
  try {
    const payload = await api('/api/support');
    state.supportTickets = mergeSupportTickets(payload.tickets);
    if (announce && notificationBaseline) {
      notificationBaseline = before;
      void refreshNotifications();
    } else {
      notificationBaseline = notificationSnapshot();
    }
    return payload;
  } catch (error) {
    if (Number(error.status) === 401) { handleSessionExpired(); return null; }
    state.supportError = error.message || 'Support service unavailable';
    return null;
  } finally {
    state.lastSupportSyncAt = Date.now();
    if (!silent) state.supportLoading = false;
    supportSyncInFlight = false;
  }
}

async function submitSupportReply(event,ticketId){event.preventDefault();if(state.supportReplyBusyById[ticketId])return;const message=String(new FormData(event.currentTarget).get('message')||'').trim();if(message.length<2)return toast('Reply must contain at least 2 characters');state.supportReplyBusyById[ticketId]=true;render();try{const replyPayload=await api('/api/support/'+encodeURIComponent(ticketId)+'/replies',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message})});if(replyPayload.ticket){state.supportTickets=[replyPayload.ticket,...state.supportTickets.filter((ticket)=>ticket.id!==ticketId)];}else{await waitForSupportSyncIdle();await refreshSupport();}state.expandedSupportTicketId=ticketId;toast('Reply sent');}catch(error){if(Number(error.status)===401){handleSessionExpired();return;}toast(error.message);}finally{delete state.supportReplyBusyById[ticketId];render();}}

async function submitSupportTicket(event) {
  event.preventDefault();
  if (state.supportSubmitting) return;
  const data = new FormData(event.currentTarget);
  const category = String(data.get('category') || 'other');
  const subject = String(data.get('subject') || '').trim();
  const message = String(data.get('message') || '').trim();
  const activationId = String(data.get('activationId') || '').trim();
  const rechargeId = String(data.get('rechargeId') || '').trim();
  state.supportForm = { category, subject, message, activationId, rechargeId };
  if (subject.length < 4) return toast('Subject must be at least 4 characters');
  if (message.length < 10) return toast('Please provide at least 10 characters of detail');
  state.supportSubmitting = true;
  state.supportError = '';
  render();
  try {
    const createPayload=await api('/api/support', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category, subject, message, activationId: activationId || null, rechargeId: rechargeId || null })
    });
    state.supportForm = { category, subject: '', message: '', activationId: '', rechargeId: '' };
    if(createPayload.ticket){state.supportTickets=[createPayload.ticket,...state.supportTickets.filter((ticket)=>ticket.id!==createPayload.ticket.id)];}
    else{await waitForSupportSyncIdle();await refreshSupport();}
    toast('Support ticket created');
  } catch (error) {
    if (Number(error.status) === 401) { handleSessionExpired(); return; }
    state.supportError = error.message || 'Support ticket could not be created';
    toast(state.supportError);
  } finally {
    state.supportSubmitting = false;
    render();
  }
}

async function runRecovery(kind) {
  if (kind === 'wallet') {
    state.page = 'wallet';
    syncPageHash('wallet');
    await refreshWallet();
    render();
    return;
  }
  if (kind === 'orders') {
    await loadCustomerData({ renderAfter: true });
    state.page = 'orders';
    syncPageHash('orders');
    render();
    return;
  }
  await loadCustomerData({ renderAfter: true });
  state.page = 'active';
  syncPageHash('active');
  render();
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
  const error = flow.error ? `<div class="purchase-error">${esc(flow.error)}</div>` + (flow.errorCode === 'NETWORK_ERROR' ? '<div class="purchase-recovery-actions"><button class="secondary-btn" type="button" data-purchase-check-active>Check Active</button><button class="secondary-btn" type="button" data-purchase-retry>Retry request</button></div>' : '') : '';
  if (activating) return `<div class="purchase-overlay" role="presentation"><div class="purchase-backdrop"></div><section class="purchase-sheet purchase-sheet-loading" role="dialog" aria-modal="true" aria-labelledby="purchase-title" tabindex="-1"><div class="purchase-sheet-top"><div><span class="kicker">STEP 3 OF 3</span><h2 id="purchase-title">Getting your number</h2></div></div><div class="purchase-steps" aria-label="Purchase progress"><span class="purchase-step done"><b>1</b> Service</span><span class="purchase-step done"><b>2</b> Review</span><span class="purchase-step current"><b>3</b> Track</span></div><div class="purchase-activation-state"><div class="purchase-loader" aria-hidden="true"></div><span class="service-category">ACTIVATION</span><h3>Reserving your number…</h3><p>We’re preparing your number now. Your active number will appear shortly.</p></div></section></div>`;
  return `<div class="purchase-overlay" role="presentation"><button class="purchase-backdrop" type="button" aria-label="Close purchase review" data-purchase-close></button><section class="purchase-sheet" role="dialog" aria-modal="true" aria-labelledby="purchase-title" tabindex="-1"><div class="purchase-sheet-top"><div><span class="kicker">STEP 2 OF 3</span><h2 id="purchase-title">Review your number</h2></div><button class="icon-btn" type="button" aria-label="Close" data-purchase-close>×</button></div><div class="purchase-steps" aria-label="Purchase progress"><span class="purchase-step done"><b>1</b> Service</span><span class="purchase-step current"><b>2</b> Review</span><span class="purchase-step"><b>3</b> Track</span></div><div class="purchase-service-card"><div class="service-icon large">${iconFor(data.service.category)}</div><div class="purchase-service-copy"><span class="service-category">${esc(data.service.category)}</span><strong>${esc(data.service.name)}</strong><span>Number format: +91 · OTP delivery timing varies by service</span></div></div><div class="purchase-detail-grid"><div><span>Number format</span><strong>+91</strong><small>Marketplace format</small></div><div><span>Price</span><strong>${money(data.pricePaise)}</strong><small>One activation</small></div><div><span>Number validity</span><strong>25 minutes</strong><small>Maximum validity</small></div><div><span>Wallet balance</span><strong>${money(state.balancePaise)}</strong><small>Available to use now</small></div><div><span>After purchase</span><strong>${insufficient ? "—" : money(Math.max(0, data.afterBalancePaise))}</strong><small>${insufficient ? "Add funds required" : "Estimated remaining balance"}</small></div></div><div class="purchase-trust"><span>✓</span><div><strong>Activation tracking</strong><small>After confirmation, your number appears in Active. OTP delivery timing varies by service; status updates are shown there.</small></div></div>${error}${insufficient ? `<div class="purchase-actions"><button class="secondary-btn" type="button" data-purchase-close>Back</button><button class="primary-btn" type="button" data-purchase-wallet>Add funds</button></div>` : `<div class="purchase-actions"><button class="secondary-btn" type="button" data-purchase-close>Back</button><button class="primary-btn purchase-confirm-btn" type="button" data-purchase-confirm>Get number <span>→</span></button></div>`}</section></div>`;
}

async function confirmPurchase() {
  const data = purchaseFlowData();
  if (!data.service) return;
  if (state.balancePaise < data.pricePaise) {
    state.purchaseFlow.error = 'You need more wallet balance to complete this activation.';
    state.purchaseFlow.errorCode = 'INSUFFICIENT_BALANCE';
    renderBuyCatalog();
    return;
  }
  state.purchaseFlow.step = 'activation';
  state.purchaseFlow.submitting = true;
  state.purchaseFlow.error = '';
  state.purchaseFlow.errorCode = '';
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
    setPage('wallet');
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
    const numberRevealAt = Number(activation.syntheticNumberRevealAt || activation.metadata?.numberRevealAt || 0);
    const numberPopupDelay = numberRevealAt ? Math.max(0, numberRevealAt - Date.now()) : 0;
    queueNotificationPopup({
      title: 'Number fetched successfully',
      body: 'Your ' + activation.service + ' number ' + activation.number + ' is ready to use.',
      page: 'active',
      tone: 'success',
      sourceType: 'activation',
      sourceId: activation.id,
      eventKey: 'status:Active',
      delayMs: numberPopupDelay
    });
    state.active.unshift(activation);
    state.orders.unshift({ id: activation.id, service: activation.service, number: activation.number, pricePaise: activation.pricePaise, status: 'Active', otp: 'Waiting…', created: 'Just now' });
    if (Number.isFinite(activation.walletBalancePaise)) state.balancePaise = activation.walletBalancePaise;
    else state.balancePaise = Math.max(0, state.balancePaise - Number(activation.pricePaise || 0));
    state.page = 'active';
    syncPageHash('active');
    resetPurchaseFlow();
    persist();
    await loadCustomerData({ silent: true });
    state.page = 'active';
    syncPageHash('active');
    resetPurchaseFlow();
    render();
    toast(activation.service + ' • Number reserved');
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
      state.purchaseFlow.error = 'The request may still be processing. Use Active to check before starting another request.';
      state.purchaseFlow.errorCode = 'NETWORK_ERROR';
      persist();
      renderBuyCatalog();
      return;
    }
    delete state.pendingPurchaseKeys[purchaseKey];
    state.purchaseFlow.step = 'review';
    state.purchaseFlow.submitting = false;
    state.purchaseFlow.error = error.message || 'We could not complete this activation.';
    state.purchaseFlow.errorCode = error.code || 'ACTIVATION_ERROR';
    persist();
    if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
      toast('Purchase request could not be reused. Please start a new purchase.');
    } else {
      toast(error.message);
    }
    renderBuyCatalog();
  }
}

async function refreshSingleActivation(id) {
  const target = state.active.find((entry) => entry.id === id);
  if (!target) return;
  try {
    const latest = await api('/api/activations/' + encodeURIComponent(id));
    delete state.activeActionErrorById[id];
    const index = state.active.findIndex((entry) => entry.id === id);
    if (isLiveActivation(latest)) {
      if (index >= 0) state.active[index] = { ...state.active[index], ...latest };
      else state.active.push(latest);
    } else {
      if (index >= 0) state.active.splice(index, 1);
      if (['Completed', 'Expired', 'Refunded', 'Cancelled'].includes(String(latest.status || ''))) {
        state.recentActivations = [latest, ...state.recentActivations.filter((entry) => entry.id !== latest.id)]
          .filter((entry) => !entry.createdAt || Number(entry.createdAt) >= Date.now() - 15 * 60 * 1000)
          .slice(0, 6);
      }
    }
    state.activeSyncError = '';
    renderActiveOnly();
  } catch (error) {
    if (Number(error.status) === 401) { handleSessionExpired(); return; }
    state.activeActionErrorById[id] = error.message || 'Could not refresh this activation.';
    renderActiveOnly();
  }
}

async function cancelActivation(id) {
  const item = state.active.find((entry) => entry.id === id);
  if (!item || state.activeCancelBusy.has(id)) return;
  state.activeCancelBusy.add(id);
  state.activeCancelId = null;
  delete state.activeActionErrorById[id];
  renderActiveOnly();
  try {
    const result = await api('/api/activations/' + encodeURIComponent(id) + '/cancel', { method: 'POST' });
    if (Number.isFinite(result.walletBalancePaise)) state.balancePaise = result.walletBalancePaise;
    await loadCustomerData({ silent: true });
    render();
    toast('Activation cancelled and wallet refunded');
  } catch (error) {
    if (Number(error.status) === 401) {
      handleSessionExpired();
      return;
    }
    state.activeActionErrorById[id] = error.message || 'We could not cancel this activation safely.';
    state.activeSyncError = state.activeActionErrorById[id];
    toast(state.activeActionErrorById[id]);
    renderActiveOnly();
  } finally {
    state.activeCancelBusy.delete(id);
  }
}

async function refreshWallet() {
  try {
    const wallet = await api('/api/wallet');
    state.persistentState = Boolean(wallet.persistent);
    state.rechargeEnabled = Boolean(wallet.rechargeEnabled);
    state.balancePaise = Number(wallet.balancePaise || 0);
    state.walletLedger = Array.isArray(wallet.ledger) ? wallet.ledger : [];
    state.recharges = Array.isArray(wallet.recharges) ? wallet.recharges : [];
    state.rechargeUpiId = wallet.rechargeEnabled ? (wallet.upiId || null) : null;
    state.rechargePaymentSettings = wallet.rechargeEnabled ? (wallet.paymentSettings || { upiId: wallet.upiId || null, merchantName: 'INBOX9', instructions: '' }) : { upiId: null, merchantName: 'INBOX9', instructions: '', qrImage: null };
    processNotificationSnapshot({ announce: true });
    return wallet;
  } catch (error) {
    if (Number(error.status) === 401) {
      handleSessionExpired();
      return null;
    }
    toast(error.message);
    return null;
  }
}

function upiIntentUrl(amount, settings = state.rechargePaymentSettings || {}) {
  const upiId = String(settings.upiId || state.rechargeUpiId || '').trim();
  if (!upiId) return '';
  const safeAmount = Number(amount);
  const params = new URLSearchParams({
    pa: upiId,
    pn: String(settings.merchantName || 'INBOX9').trim() || 'INBOX9',
    am: Number.isFinite(safeAmount) ? safeAmount.toFixed(2) : '0.00',
    cu: 'INR',
    tn: 'INBOX9 wallet recharge'
  });
  return 'upi://pay?' + params.toString();
}

function updateRechargePaymentLink() {
  const node = document.querySelector('[data-upi-intent]');
  if (!node) return;
  const amount = Number(document.getElementById('recharge-amount')?.value || state.rechargeAmount || 100);
  node.href = upiIntentUrl(amount);
}

async function submitRecharge(event) {
  event.preventDefault();
  if (state.rechargeSubmitting) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const amount = Number(data.get('amount'));
  const utr = String(data.get('utr') || '').trim();
  if (!Number.isInteger(amount) || amount < 100 || amount > 5000) return toast('Recharge amount must be between ₹100 and ₹5,000');
  if (!/^[A-Za-z0-9._-]{4,64}$/.test(utr)) return toast('Enter a valid UTR / transaction reference');
  state.rechargeSubmitting = true;
  render();
  try {
    await api('/api/recharges', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount, utr }) });
    await refreshWallet();
    toast('Recharge submitted for verification');
  } catch (error) {
    if (Number(error.status) === 401) {
      handleSessionExpired();
      return;
    }
    toast(error.message);
  } finally {
    state.rechargeSubmitting = false;
    render();
  }
}

function setRechargeAmount(amount) {
  state.rechargeAmount = Math.min(5000, Math.max(100, Number(amount) || 100));
  render();
  document.getElementById('recharge-amount')?.focus();
}

let lastActivationSync = 0;
let lastWalletSignalSync = 0;
let activationSyncInFlight = false;

async function syncActivationItem(item) {
  try {
    const latest = await api('/api/activations/' + encodeURIComponent(item.id));
    const order = state.orders.find((entry) => entry.id === item.id);
    if (order) {
      order.status = latest.status;
      order.otp = latest.otp || (isLiveActivation(latest) ? 'Waiting…' : '—');
    }
    const previousOtp = String(item.otp || '').trim();
    const latestOtp = String(latest.otp || '').trim();
    if (latestOtp && ['Waiting…', '—'].includes(previousOtp)) {
      queueNotificationPopup({
        title: 'OTP received successfully',
        body: 'Your verification code is ready for order ' + item.id + '.',
        page: 'active',
        tone: 'success',
        sourceType: 'activation',
        sourceId: item.id,
        eventKey: 'status:Completed'
      });
    }
    const index = state.active.findIndex((entry) => entry.id === item.id);
    if (isLiveActivation(latest)) {
      if (index >= 0) state.active[index] = { ...state.active[index], ...latest };
      else state.active.push(latest);
      delete state.activeActionErrorById[item.id];
      return;
    }
    if (index >= 0) state.active.splice(index, 1);
    if (['Completed', 'Expired', 'Refunded', 'Cancelled'].includes(String(latest.status || ''))) {
      state.recentActivations = [latest, ...state.recentActivations.filter((entry) => entry.id !== latest.id)]
        .filter((entry) => !entry.createdAt || Number(entry.createdAt) >= Date.now() - 15 * 60 * 1000)
        .slice(0, 6);
    }
  } catch (error) {
    if (!/Activation not found/i.test(error.message)) {
      state.activeSyncError = error.message || 'Live activation status is temporarily unavailable';
      state.activeActionErrorById[item.id] = error.message || 'Could not refresh this activation.';
    }
  }
}

async function tick() {
  if (!state.user) {
    if (state.page === 'active') renderActiveOnly();
    return;
  }
  const now = Date.now();
  if (now - state.lastSupportSyncAt > 20_000 && !state.customerDataRefreshing && !supportSyncInFlight) {
    state.lastSupportSyncAt = now;
    void refreshSupport({ announce: true, silent: true });
  }
  if (now - state.lastCatalogRefreshAt > 60_000 && !state.customerDataRefreshing) {
    void refreshCatalog({ silent: true });
  }
  if (!state.active.length) {
    if (state.page === 'active') renderActiveOnly();
    return;
  }
  if (now - lastWalletSignalSync > 15000 && !state.customerDataRefreshing) {
    lastWalletSignalSync = now;
    void refreshWallet();
  }
  if (activationSyncInFlight) return;
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
    providers: ['/api/admin/providers', 'providers'],
    'provider-operations': ['/api/admin/provider-operations', 'providerOperations'],
    support: ['/api/admin/support', 'support']
  };
  try {
    const [url, key] = routes[tab] || routes.overview;
    const payload = await api(url);
    if (key === 'overview') state.admin.overview = payload;
    else if (key === 'providerOperations') state.admin.providerOperations = payload;
    else state.admin[key] = Array.isArray(payload[key]) ? payload[key] : [];
  } catch (error) {
    if (Number(error.status) === 401) {
      handleSessionExpired();
      return;
    }
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

async function readQrFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('QR image could not be read'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

async function adminUpdatePaymentSettings(form) {
  const data=new FormData(form);
  const upiId=String(data.get('upiId')||'').trim();
  const merchantName=String(data.get('merchantName')||'INBOX9').trim();
  const instructions=String(data.get('instructions')||'').trim();
  const qrUrl=String(data.get('qrUrl')||'').trim();
  const file=data.get('qrFile');
  let qrImage=qrUrl||null;
  if (file && typeof file === 'object' && file.size) {
    if (file.size > 250*1024) return toast('QR image must be 250 KB or smaller');
    try { qrImage=await readQrFileAsDataUrl(file); } catch (error) { return toast(error.message); }
  }
  if (data.get('removeQr')==='on') qrImage=null;
  try {
    await api('/api/admin/payment-settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({upiId,merchantName,instructions,qrImage})});
    toast('Payment settings updated');
    await loadAdminTab('payments');
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

async function adminUpdateSupport(id, form) {
  const data = new FormData(form);
  const status = String(data.get('status') || 'Open');
  const adminNote = String(data.get('adminNote') || '').trim();
  const reply = String(data.get('reply') || '').trim();
  try {
    await api(`/api/admin/support/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, adminNote, reply })
    });
    toast('Support ticket updated');
    await loadAdminTab('support');
  } catch (error) {
    toast(error.message);
  }
}

async function adminAssignSupport(id, assignedAdminId) {
  try {
    await api(`/api/admin/support/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignedAdminId })
    });
    toast(assignedAdminId ? 'Ticket assigned to you' : 'Ticket unassigned');
    await loadAdminTab('support');
  } catch (error) {
    toast(error.message);
  }
}

function adminPage() {
  if (state.user?.role !== 'admin') return `<div class="panel empty"><div class="empty-icon">!</div><h3>Admin access required</h3><p>Your account does not have permission to open the operations center.</p></div>`;
  const tabs = [
    ['overview', 'Overview'], ['recharges', 'UTR Queue'], ['payments', 'Payments'], ['support', 'Support'], ['services', 'Services'],
    ['users', 'Users'], ['activations', 'Activations'], ['ledger', 'Ledger'],
    ['providers', 'Providers'], ['provider-operations', 'Reconciliation'], ['audit', 'Audit Log']
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
  if (tab === 'payments') return adminPaymentsPage();
  if (tab === 'support') return adminSupportPage();
  if (tab === 'services') return adminServicesPage();
  if (tab === 'users') return adminUsersPage();
  if (tab === 'activations') return adminActivationsPage();
  if (tab === 'ledger') return adminLedgerPage();
  if (tab === 'providers') return adminProvidersPage();
  if (tab === 'provider-operations') return adminProviderOperationsPage();
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

function adminPaymentsPage() {
  const payload=state.admin.paymentSignals||{};
  const totals=payload.summary?.totals||{};
  const byStatus=Array.isArray(payload.summary?.byStatus)?payload.summary.byStatus:[];
  const settings=payload.paymentSettings||state.admin.paymentSettings||{};
  const sessions=Array.isArray(payload.sessionSignals)?payload.sessionSignals:[];
  const flagged=Array.isArray(payload.flagged)?payload.flagged:[];
  const webhooks=Array.isArray(payload.webhookEvents)?payload.webhookEvents:[];
  const statusClass=(status)=>({Approved:'approved',Rejected:'rejected',Pending:'active',Processed:'approved',Ignored:'expired',Received:'active'}[String(status)]||'expired');
  const settingsQr=settings.qrImage?'<div class="admin-payment-qr-preview"><img src="'+esc(settings.qrImage)+'" alt="Configured payment QR code" loading="lazy"></div>':'<div class="admin-payment-qr-empty">No QR configured</div>';
  const sessionRows=sessions.length?sessions.map(r=>'<tr><td><strong>'+esc(r.email||'Unknown')+'</strong><small class="table-sub">'+esc(r.id)+'</small></td><td>'+money(r.amountPaise||0)+'</td><td class="mono">'+esc(r.utr||'—')+'</td><td class="mono">'+esc(r.submissionSessionId||'Not captured')+'</td><td><span class="table-status '+(r.submissionSession?.active?'approved':'expired')+'">'+(r.submissionSession?.active?'Submission session active':'Expired / revoked')+'</span></td><td><span class="table-status '+(r.sessionContext?.currentMatchesSubmission?'approved':'expired')+'">'+(r.sessionContext?.currentMatchesSubmission?'Current session matches':'Current session differs')+'</span><small class="table-sub">'+esc(String(r.sessionContext?.activeCount||0))+' active session(s)</small></td></tr>').join(''):'<tr><td colspan="6"><div class="empty-mini">No pending session-linked payments.</div></td></tr>';
  const flaggedRows=flagged.length?flagged.map(r=>'<tr><td class="mono">'+esc(r.id)+'</td><td>'+esc(r.email||'Unknown')+'</td><td>'+money(r.amountPaise||0)+'</td><td class="mono">'+esc(r.utr||'—')+'</td><td>'+esc(r.flagReason||'Flagged for review')+'</td></tr>').join(''):'<tr><td colspan="5"><div class="empty-mini">No flagged payments.</div></td></tr>';
  const webhookRows=webhooks.length?webhooks.slice(0,20).map(e=>'<tr><td class="mono">'+esc(e.provider)+'<small class="table-sub">'+esc(e.eventId)+'</small></td><td>'+esc(e.eventType)+'</td><td class="mono">'+esc(e.rechargeId)+'</td><td>'+money(e.amountPaise||0)+'</td><td><span class="table-status '+statusClass(e.status)+'">'+esc(e.status)+'</span></td><td>'+esc(e.outcome||'—')+(e.errorCode?'<small class="table-sub">'+esc(e.errorCode)+'</small>':'')+'</td><td>'+esc(e.receivedAt?new Date(e.receivedAt).toLocaleString():'—')+'</td></tr>').join(''):'<tr><td colspan="7"><div class="empty-mini">No webhook events received.</div></td></tr>';
  const statusCards=byStatus.map(x=>'<div class="panel admin-kpi"><span>'+esc(x.status)+'</span><strong>'+esc(String(x.count))+'</strong><small>'+money(x.amountPaise)+' value</small></div>').join('');
  return '<div class="admin-payment-summary"><div class="admin-kpi-grid"><div class="panel admin-kpi"><span>Total payment requests</span><strong>'+esc(String(totals.count||0))+'</strong><small>'+money(totals.amountPaise||0)+' request value</small></div><div class="panel admin-kpi"><span>Flagged</span><strong>'+esc(String(totals.flaggedCount||0))+'</strong><small>Requires review</small></div>'+statusCards+'</div></div>'+
  '<div class="panel admin-card admin-payment-settings"><div class="panel-head"><div><h3>Payment destination</h3><span>Admin-managed UPI ID + QR. Changes apply to new recharge submissions; existing requests retain their recorded destination.</span></div><span class="status-chip">'+(settings.upiId?'CONFIGURED':'SETUP REQUIRED')+'</span></div><form id="admin-payment-settings-form" class="admin-payment-settings-form"><div class="admin-payment-settings-grid"><label>UPI ID<input name="upiId" type="text" maxlength="128" value="'+esc(settings.upiId||'')+'" placeholder="merchant@upi" autocomplete="off" required></label><label>Merchant name<input name="merchantName" type="text" maxlength="80" value="'+esc(settings.merchantName||'INBOX9')+'" required></label><label class="full">Payment instructions<textarea name="instructions" rows="3" maxlength="500" placeholder="Instructions shown to customers">'+esc(settings.instructions||'Pay the exact amount and keep the UTR / transaction reference.')+'</textarea></label><label class="full">QR image URL <span>(optional HTTPS URL)</span><input name="qrUrl" type="url" maxlength="2048" value="'+esc(settings.qrImage&&/^https:\/\//i.test(settings.qrImage)?settings.qrImage:'')+'" placeholder="https://.../inbox9-qr.png"></label><label class="full">Upload QR image <span>(PNG/JPEG/WebP, max 250 KB)</span><input name="qrFile" type="file" accept="image/png,image/jpeg,image/webp"></label><label class="check-inline full"><input name="removeQr" type="checkbox"> Remove the currently configured QR</label></div><div class="admin-payment-qr-area">'+settingsQr+'</div><div class="admin-actions"><span class="form-note">Server validates the UPI ID and QR format/size, and every change is added to the audit trail.</span><button class="buy-btn" type="submit">Save payment settings</button></div></form></div>'+
  '<div class="panel table-panel"><div class="panel-head"><div><h3>Payment signals / session context</h3><span>Pending payments linked to the customer account session used at submission.</span></div><span class="status-chip">'+sessions.length+' shown</span></div><table><thead><tr><th>Account</th><th>Amount</th><th>UTR</th><th>Submission session</th><th>Submission state</th><th>Current session signal</th></tr></thead><tbody>'+sessionRows+'</tbody></table></div>'+
  '<div class="admin-grid-two"><div class="panel table-panel"><div class="panel-head"><div><h3>Flagged payments</h3><span>Manually flagged reconciliation cases.</span></div></div><table><thead><tr><th>Request</th><th>Account</th><th>Amount</th><th>UTR</th><th>Reason</th></tr></thead><tbody>'+flaggedRows+'</tbody></table></div><div class="panel table-panel"><div class="panel-head"><div><h3>Webhook signals</h3><span>Server-side payment events; wallet credit requires verified settlement.</span></div></div><table><thead><tr><th>Provider</th><th>Event</th><th>Recharge</th><th>Amount</th><th>Status</th><th>Outcome</th><th>Received</th></tr></thead><tbody>'+webhookRows+'</tbody></table></div></div>';
}

function adminProviderOperationsPage() {
  const monitor = state.admin.providerOperations || {};
  const summary = monitor.summary || {};
  const cards = [
    ['Pending', summary.pending || 0],
    ['Failed', summary.failed || 0],
    ['Succeeded', summary.succeeded || 0],
    ['Oldest pending', summary.oldestPendingAt ? new Date(summary.oldestPendingAt).toLocaleString() : 'None']
  ];
  const statusClass = (status) => ({ Pending: 'active', Failed: 'rejected', Succeeded: 'approved' }[String(status)] || 'expired');
  const operations = Array.isArray(monitor.operations) ? monitor.operations : [];
  const rows = operations.length ? operations.map(op => `<tr><td class="mono">${esc(op.operationType)}<small class="table-sub">${esc(op.id)}</small></td><td><strong>${esc(op.service || 'Unknown service')}</strong><small class="table-sub">${esc(op.activationId || '—')}</small></td><td>${esc(op.email || '—')}</td><td><span class="table-status ${statusClass(op.status)}">${esc(op.status)}</span><small class="table-sub">${Number(op.attempts || 0)} attempt(s)</small></td><td>${esc(op.adapterKey || op.providerId || '—')}</td><td>${esc(op.lastError || op.activationStatus || '—')}</td><td>${esc(new Date(op.updatedAt || op.createdAt).toLocaleString())}</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-mini">No provider operations recorded.</div></td></tr>';
  return `<div class="admin-kpi-grid">${cards.map(([label,value]) => `<div class="panel admin-kpi"><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
  <div class="panel table-panel"><div class="panel-head"><div><h3>Durable reconciliation queue</h3><span>Recent cancellation and expiration operations, including failed provider work.</span></div></div><table><thead><tr><th>Operation</th><th>Service / Activation</th><th>User</th><th>Status</th><th>Adapter</th><th>Detail</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function adminRechargesPage() {
  const rows = state.admin.recharges.length ? state.admin.recharges.map(r => {
    const session = r.submissionSession || {};
    const context = r.sessionContext || {};
    const history = Array.isArray(r.recentPayments) ? r.recentPayments : [];
    const sessionLabel = r.submissionSessionId || 'Not captured';
    const activeLabel = session.active ? 'Active at review' : (r.submissionSessionId ? 'Expired / revoked' : 'Unavailable');
    const historyMarkup = history.length
      ? history.slice(0, 5).map(item => '<div class="admin-recharge-history-row"><span class="mono">'+esc(item.utr || '—')+'</span><strong>'+money(item.amountPaise || 0)+'</strong><span class="table-status '+({Approved:'approved',Rejected:'rejected',Pending:'active'}[String(item.status)] || 'expired')+'">'+esc(item.status || 'Unknown')+'</span><small>'+esc(item.submittedAt ? new Date(item.submittedAt).toLocaleString() : '—')+'</small></div>').join('')
      : '<div class="empty-mini">No previous payment requests for this account.</div>';
    return '<tr>' +
      '<td class="mono">'+esc(r.id)+'</td>' +
      '<td><div class="admin-recharge-user"><strong>'+esc(r.email)+'</strong><small class="table-sub">'+esc(r.userId || '—')+'</small><small class="table-sub">Account '+esc(r.accountCreatedAt ? new Date(r.accountCreatedAt).toLocaleDateString() : '—')+'</small></div></td>' +
      '<td><strong>'+money(r.amountPaise)+'</strong><small class="table-sub">Requested</small></td>' +
      '<td class="mono">'+esc(r.utr)+'</td>' +
      '<td>'+esc(new Date(r.submittedAt).toLocaleString())+'</td>' +
      '<td><div class="admin-recharge-context">' +
        '<div class="admin-recharge-context-head"><strong>Payment context</strong><span class="table-status '+(session.active ? 'approved' : 'expired')+'">'+esc(activeLabel)+'</span></div>' +
        '<div class="admin-recharge-context-grid"><span>Submitted session<strong class="mono">'+esc(sessionLabel)+'</strong></span><span>Active sessions<strong>'+esc(String(context.activeCount || 0))+'</strong></span><span>Current session<strong class="mono">'+esc(context.currentId || '—')+'</strong></span><span>Match<strong>'+esc(context.currentMatchesSubmission ? 'Yes' : 'No / unavailable')+'</strong></span></div>' +
        '<div class="admin-recharge-history"><div class="admin-recharge-history-head"><span>Recent payment history for this account</span><small>Use the actual received transaction for final approval</small></div>'+historyMarkup+'</div>' +
        '<div class="admin-verify-fields"><label>Verified amount<input type="number" min="100" max="5000" step="0.01" value="'+(Number(r.amountPaise || 0) / 100).toFixed(2)+'" data-admin-verified-amount></label><label>Verified UTR<input type="text" minlength="4" maxlength="64" value="'+esc(r.utr)+'" data-admin-verified-utr></label><label>External reference <span>(optional)</span><input type="text" maxlength="120" placeholder="Bank/payment ref" data-admin-external-reference></label></div>' +
        '<div class="admin-actions"><button class="buy-btn" type="button" data-admin-approve="'+esc(r.id)+'">Approve verified payment</button><button class="text-danger admin-reject" type="button" data-admin-reject="'+esc(r.id)+'">Reject</button></div>' +
      '</div></td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="6"><div class="empty-mini">No pending recharge requests.</div></td></tr>';
  return '<div class="panel table-panel"><div class="panel-head"><div><h3>Pending UTR verification</h3><span>Account, originating session and payment history are shown together. Verify the actual received transaction before approval.</span></div><span class="status-chip">'+state.admin.recharges.length+' pending</span></div><table><thead><tr><th>Request</th><th>Account</th><th>Amount</th><th>UTR</th><th>Submitted</th><th>Verification context / action</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}

function adminSupportPage(){const tickets=Array.isArray(state.admin.support)?state.admin.support:[],filter=state.adminSupportFilter||'all';const counts=tickets.reduce((a,t)=>{const st=String(t.status||'Open');a[st]=(a[st]||0)+1;return a;},{});const visible=filter==='all'?tickets:tickets.filter(t=>String(t.status||'Open')===filter);const filters=[['all','All',tickets.length],['Open','Open',counts.Open||0],['In Progress','In Progress',counts['In Progress']||0],['Resolved','Resolved',counts.Resolved||0],['Closed','Closed',counts.Closed||0]];const cards=visible.length?visible.map(ticket=>{const status=String(ticket.status||'Open');const activation=ticket.activation?'<span class="admin-support-ref">Activation · '+esc(ticket.activation.id)+(ticket.activation.service?' · '+esc(ticket.activation.service):'')+(ticket.activation.status?' · '+esc(ticket.activation.status):'')+'</span>':'';const recharge=ticket.recharge?'<span class="admin-support-ref">Recharge · '+esc(ticket.recharge.id)+(ticket.recharge.status?' · '+esc(ticket.recharge.status):'')+'</span>':'';const messages=Array.isArray(ticket.messages)?ticket.messages:[];const thread=messages.length?'<div class="admin-support-thread">'+messages.map(m=>'<div class="admin-support-message-row"><strong>'+esc(m.authorRole==='admin'?'Support':'Customer')+'</strong><span>'+esc(new Date(m.createdAt).toLocaleString())+'</span><p>'+esc(m.body)+'</p></div>').join('')+'</div>':'<p class="admin-support-message">'+esc(ticket.message)+'</p>';return'<article class="panel admin-support-card"><div class="admin-support-head"><div><span class="kicker">'+esc(ticket.category||'other')+'</span><h3>'+esc(ticket.subject)+'</h3><small class="mono">'+esc(ticket.id)+' · '+esc(new Date(ticket.createdAt).toLocaleString())+'</small></div><span class="table-status '+supportStatusClass(status)+'">'+esc(status)+'</span></div><div class="admin-support-customer"><div><strong>'+esc(ticket.email||'Unknown customer')+'</strong><small>Created '+esc(new Date(ticket.createdAt).toLocaleString())+'</small></div><span>Last updated '+esc(new Date(ticket.updatedAt||ticket.createdAt).toLocaleString())+'</span></div><div class="admin-support-assignment"><span>Assigned to <strong>'+esc(ticket.assignedAdminEmail||'Unassigned')+'</strong></span><span class="admin-support-assign-actions">'+(ticket.assignedAdminId===state.user?.id?'<button class="filter-btn selected" type="button" disabled>Assigned to me</button>':'<button class="filter-btn" type="button" data-admin-support-assign="'+esc(ticket.id)+'">Assign to me</button>')+(ticket.assignedAdminId?'<button class="filter-btn" type="button" data-admin-support-unassign="'+esc(ticket.id)+'">Unassign</button>':'')+'</span></div>'+thread+'<div class="admin-support-refs">'+activation+recharge+'</div><form class="admin-support-form" data-admin-support-form="'+esc(ticket.id)+'"><label>Status<select name="status">'+['Open','In Progress','Resolved','Closed'].map(st=>'<option value="'+esc(st)+'" '+(status===st?'selected':'')+'>'+esc(st)+'</option>').join('')+'</select></label><label>Internal note<textarea name="adminNote" maxlength="1000" rows="3" placeholder="Internal note for the support record.">'+esc(ticket.adminNote||'')+'</textarea></label><label><span>Support response</span><textarea name="reply" maxlength="4000" rows="3" placeholder="Reply directly to the customer."></textarea></label><div class="admin-support-actions"><span>Changes are audited.</span><button class="buy-btn" type="submit">Save update</button></div></form></article>';}).join(''):'<div class="panel support-empty"><div class="empty-icon">✓</div><h3>No tickets in this view</h3><p>New customer support requests will appear here.</p></div>';return'<div class="admin-support-toolbar"><div class="admin-support-filters">'+filters.map(([id,label,count])=>'<button class="filter-btn '+(filter===id?'selected':'')+'" type="button" data-admin-support-filter="'+esc(id)+'">'+esc(label)+' <b>'+count+'</b></button>').join('')+'</div><button class="refresh-btn" type="button" data-admin-support-refresh>Refresh</button></div><div class="admin-support-list">'+cards+'</div>';}
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

function authPage(){const register=state.authMode==='register',recover=state.authMode==='recover';if(recover)return'<div class="auth-shell"><div class="auth-card"><div class="brand-row auth-brand"><div class="brand-mark">ϟ</div><div><div class="brand-name">INBOX9</div><div class="brand-sub">OTP MARKETPLACE</div></div></div><span class="kicker">ACCOUNT RECOVERY</span><h1>Recover your account</h1><p class="auth-copy">Use the single-use recovery code saved from Account.</p><form id="auth-form"><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Recovery code<input name="recoveryCode" type="text" autocomplete="one-time-code" required placeholder="REC-XXXXXXXXXXXXXXXX"></label><label>New password<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button class="primary-btn auth-submit" type="submit">Reset password</button></form><div class="auth-switch"><button type="button" data-auth-mode="login">Back to sign in</button></div><div class="auth-note">Recovery codes are single-use. Store them offline.</div></div></div>';return'<div class="auth-shell"><div class="auth-card"><div class="brand-row auth-brand"><div class="brand-mark">ϟ</div><div><div class="brand-name">INBOX9</div><div class="brand-sub">OTP MARKETPLACE</div></div></div><span class="kicker">SECURE ACCOUNT</span><h1>'+(register?'Create your account':'Welcome back')+'</h1><p class="auth-copy">'+(register?'Create an account to access the marketplace.':'Sign in to continue to your INBOX9 dashboard.')+'</p><form id="auth-form"><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="'+(register?'new-password':'current-password')+'" minlength="8" required></label>'+(register?'<label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="8" required></label>':'')+'<button class="primary-btn auth-submit" type="submit">'+(register?'Create account':'Sign in')+'</button></form><div class="auth-switch">'+(register?'Already have an account?':'New to INBOX9?')+' <button type="button" data-auth-mode="'+(register?'login':'register')+'">'+(register?'Sign in':'Create account')+'</button></div>'+(!register?'<button class="link-btn auth-forgot" type="button" data-auth-mode="recover">Forgot password? Use a recovery code</button>':'')+'<div class="auth-note">Secure access is required for every session.</div></div></div>';}
function bootstrapErrorPage() {
  const message = esc(state.bootstrapError || 'The application is temporarily unavailable.');
  return '<div class="auth-shell"><div class="auth-card"><div class="brand-row auth-brand"><div class="brand-mark">ϟ</div><div><div class="brand-name">INBOX9</div><div class="brand-sub">OTP MARKETPLACE</div></div></div><span class="kicker">CONNECTION CHECK</span><h1>We could not load INBOX9</h1><p class="auth-copy">' + message + '</p><button class="primary-btn auth-submit" type="button" data-action="retry-bootstrap">Retry</button><div class="auth-note">Your account data remains on the server. A temporary connection problem does not sign you out.</div></div></div>';
}

function startupSplashPage() {
  return '<div class="boot-loader" role="status" aria-label="Loading INBOX9"><div class="boot-loader-inner"><div class="boot-brand"><span class="boot-brand-mark" aria-hidden="true">ϟ</span><span><strong class="boot-brand-name">INBOX9</strong><span class="boot-brand-sub">OTP MARKETPLACE</span></span></div></div></div>';
}

function showStartupSplash() {
  const app = document.getElementById('app');
  if (!app) return;
  app.setAttribute('aria-busy', 'true');
  app.innerHTML = startupSplashPage();
}

function securityModal() {
  return `<div class="security-overlay" role="presentation"><section class="security-modal" role="dialog" aria-modal="true" aria-labelledby="security-title" tabindex="-1"><div class="panel-head"><div><h3 id="security-title">Account security</h3><span>7-day sessions • maximum 5 retained sessions by default</span></div><button class="icon-btn" type="button" aria-label="Close" data-action="close-security">×</button></div><div class="security-body"><form id="change-password-form" class="security-form"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" minlength="8" required></label><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button class="primary-btn" type="submit">Change password</button></form><div class="security-divider"></div><div class="security-danger"><div><strong>Sign out all sessions</strong><p>This invalidates every active session on all devices and returns you to the login screen.</p></div><button class="buy-btn" type="button" data-action="logout-all">Sign out all</button></div></div></section></div>`;
}

function render() {
  if (!state.user) {
    syncOverlayScrollLock();
    document.getElementById('app').innerHTML = state.bootstrapError ? bootstrapErrorPage() : authPage();
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
          ${appNav().map(([id, label, glyph]) => `<button class="nav-item ${state.page === id ? 'active' : ''}" type="button" data-page="${id}" aria-current="${state.page === id ? 'page' : 'false'}"><span>${glyph}</span>${label}${id === 'active' && state.active.length ? `<span class="count-badge">${state.active.length}</span>` : ''}</button>`).join('')}
        </nav>
        <div class="sidebar-spacer"></div>
        <div class="trust-card"><span>✓</span><div><strong>Secure activation</strong><span>Protected service layer</span></div></div>
        <div class="user-card"><div class="avatar">PX</div><div class="user-copy"><strong>${esc(state.user?.email || "User")}</strong><span>${esc(state.user?.role || "user")} account</span></div><button class="icon-btn" type="button" aria-label="Account security" data-action="security">⌘</button><button class="icon-btn" type="button" aria-label="Sign out" data-action="logout">↪</button></div>
      </aside>
      ${state.mobileMenu ? '<button class="mobile-backdrop" type="button" aria-label="Close navigation" data-action="close-menu"></button>' : ''}
      <main class="main">
        <header class="topbar">
          <div class="breadcrumb"><button class="menu-btn icon-btn" type="button" aria-label="Open menu" data-action="open-menu">☰</button><span>Market</span><span>/</span><strong>${esc(current)}</strong></div>
          <div class="top-actions"><button class="wallet-chip" type="button" data-page="wallet">▱ ${money(state.balancePaise)} <b>+</b></button><span class="topbar-live-status ${state.reconnecting ? 'reconnecting' : state.customerDataRefreshing ? 'syncing' : ''}" data-global-sync role="status" aria-live="polite"><span class="live-dot"></span><span>${state.reconnecting ? 'Reconnecting' : state.customerDataRefreshing ? 'Syncing' : 'Connected'}</span></span>${notificationPanel()}</div>
        </header>
        <section class="content-wrap">
          ${state.page === 'buy' ? hero() : ''}
          ${state.error ? `<div class="panel runtime-error" role="alert"><div><strong>Some live data could not be refreshed.</strong><span>${esc(state.error)}</span></div><button class="secondary-btn" type="button" data-action="refresh-customer">Retry</button></div>` : ''}
          <div id="content">${content()}</div>
        </section>
      </main>
      ${state.securityOpen ? securityModal() : ''}
      ${renderNotificationPopup()}
    </div>`;
  bindEvents();
  syncOverlayScrollLock();
  if (state.securityOpen) scheduleDialogFocus();
}

function hero() {
  const activeCount = state.active.length;
  return `<section class="hero-strip premium-hero">
    <div class="hero-copy">
      <div class="hero-eyebrow"><span class="pulse-dot"></span><span>NUMBER MARKETPLACE</span><span class="hero-eyebrow-sep">/</span><span>TRACK IN ACTIVE</span></div>
      <h1>Get a number. Get your code. Keep moving.</h1>
      <p>Pick a service and track the activation from one focused workspace. Number handling stays behind the scenes.</p>
      <div class="hero-actions">
        <button class="primary-btn hero-primary" type="button" data-page="buy">Browse services <span>→</span></button>
        <button class="ghost-btn" type="button" data-page="wallet">Add funds <span>+</span></button>
      </div>
    </div>
    <div class="hero-dashboard">
      <div class="hero-live"><span class="live-dot"></span><strong>Account ready</strong><span>SECURE SESSION</span></div>
      <div class="hero-stat-grid">
        <div class="hero-stat"><span>Services</span><strong>${state.services.length.toLocaleString()}</strong><small>ready to browse</small></div>
        <div class="hero-stat"><span>Number validity</span><strong>25 min</strong><small>maximum validity</small></div>
        <div class="hero-stat"><span>Active now</span><strong>${activeCount}</strong><small>${activeCount === 1 ? 'activation' : 'activations'}</small></div>
      </div>
    </div>
  </section>`;
}

function catalogFreshnessText() {
  if (state.catalogLoading) return 'Refreshing live catalog…';
  if (!state.lastCatalogRefreshAt) return 'Waiting for first catalog sync';
  const ageSeconds = Math.max(0, Math.floor((Date.now() - state.lastCatalogRefreshAt) / 1000));
  if (ageSeconds < 10) return 'Catalog synced just now';
  if (ageSeconds < 60) return 'Catalog synced ' + ageSeconds + 's ago';
  const ageMinutes = Math.floor(ageSeconds / 60);
  return 'Catalog synced ' + ageMinutes + 'm ago';
}

function catalogLoadingMarkup() {
  return Array.from({ length: 6 }, (_, index) => `
    <article class="catalog-skeleton-card" aria-hidden="true" style="--skeleton-index:${index}">
      <div class="catalog-skeleton-main">
        <span class="skeleton-block skeleton-icon"></span>
        <span class="skeleton-copy"><span class="skeleton-block skeleton-line wide"></span><span class="skeleton-block skeleton-line medium"></span><span class="skeleton-block skeleton-line short"></span></span>
        <span class="skeleton-block skeleton-price"></span>
      </div>
      <div class="catalog-skeleton-bottom"><span class="skeleton-block skeleton-fact"></span><span class="skeleton-block skeleton-fact"></span><span class="skeleton-block skeleton-button"></span></div>
    </article>
  `).join('');
}

function catalogEmptyMarkup() {
  if (state.catalogLoading && !state.services.length) {
    return catalogLoadingMarkup();
  }
  if (state.catalogError && !state.services.length) {
    return `<div class="market-empty panel catalog-error-state" role="alert">
      <div class="empty-icon">!</div>
      <h3>We couldn't load the marketplace</h3>
      <p>${esc(state.catalogError)}</p>
      <button class="primary-btn" type="button" data-refresh-catalog>Retry catalog</button>
    </div>`;
  }
  return marketListMarkup(filteredMarketServices());
}

const SUPPORT_CATEGORIES = [
  ['activation', 'Activation / OTP'],
  ['recharge', 'Recharge / Payment'],
  ['wallet', 'Wallet / Balance'],
  ['account', 'Account / Login'],
  ['other', 'Other']
];

function supportStatusClass(status) {
  return String(status || 'Open').toLowerCase().replace(/[^a-z]+/g, '-');
}

function supportTicketCard(ticket){const status=String(ticket.status||'Open'),category=SUPPORT_CATEGORIES.find(([id])=>id===ticket.category)?.[1]||'Support',expanded=state.expandedSupportTicketId===ticket.id;const messages=Array.isArray(ticket.messages)&&ticket.messages.length?ticket.messages:[{id:'initial-'+ticket.id,authorRole:'customer',body:ticket.message,createdAt:ticket.createdAt}];const refs=(ticket.activation?'<span class="support-reference">Activation · '+esc(ticket.activation.id)+(ticket.activation.service?' · '+esc(ticket.activation.service):'')+(ticket.activation.status?' · '+esc(ticket.activation.status):'')+'</span>':'')+(ticket.recharge?'<span class="support-reference">Recharge · '+esc(ticket.recharge.id)+(ticket.recharge.status?' · '+esc(walletStatusLabel({source:'recharge',status:ticket.recharge.status})):'')+'</span>':'');const thread=messages.map(m=>'<div class="support-message '+(m.authorRole==='admin'?'from-support':'from-customer')+'"><div class="support-message-head"><strong>'+esc(m.authorRole==='admin'?'INBOX9 Support':'You')+'</strong><small>'+esc(new Date(m.createdAt).toLocaleString())+'</small></div><p>'+esc(m.body)+'</p></div>').join('');const reply=status==='Closed'?'<small class="thread-closed-note">Closed tickets cannot receive new replies.</small>':'<form class="support-reply-form" data-support-reply="'+esc(ticket.id)+'"><textarea name="message" maxlength="4000" placeholder="Reply to support…" aria-label="Reply to support"></textarea><button class="primary-btn" type="submit">'+(state.supportReplyBusyById[ticket.id]?'Sending…':'Send reply')+'</button></form>';return'<article class="support-ticket-card '+(expanded?'expanded':'')+'"><button class="support-ticket-head" type="button" data-support-toggle="'+esc(ticket.id)+'" aria-expanded="'+String(expanded)+'"><span><span class="kicker">'+esc(category)+'</span><h3>'+esc(ticket.subject)+'</h3><small>#'+esc(ticket.id)+' · '+esc(new Date(ticket.createdAt).toLocaleString())+'</small></span><span class="table-status '+supportStatusClass(status)+'">'+esc(status)+' · '+messages.length+' messages</span></button>'+(expanded?'<div class="support-thread"><div class="support-thread-messages">'+thread+'</div><div class="support-thread-refs">'+refs+'</div>'+reply+'</div>':'<div class="support-ticket-preview"><span>Latest message</span><strong>'+esc(messages[messages.length-1]?.body||ticket.message)+'</strong></div>')+'</article>';}
function supportRecoveryCards(){return '<div class="support-recovery-grid"><button class="panel recovery-card" type="button" data-recovery="active"><span class="recovery-icon">◌</span><div><strong>Activation recovery</strong><small>Refresh active numbers and OTP status.</small></div><span>→</span></button><button class="panel recovery-card" type="button" data-recovery="wallet"><span class="recovery-icon">▱</span><div><strong>Wallet recovery</strong><small>Refresh balance and recharge status.</small></div><span>→</span></button><button class="panel recovery-card" type="button" data-recovery="orders"><span class="recovery-icon">▤</span><div><strong>Order recovery</strong><small>Reload the authoritative activation timeline.</small></div><span>→</span></button></div>';}
function supportPage(){const tickets=Array.isArray(state.supportTickets)?state.supportTickets:[],form=state.supportForm||{};const activeOptions=state.active.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.service)+' · '+esc(i.number)+'</option>').join('');const rechargeOptions=state.recharges.map(i=>'<option value="'+esc(i.id)+'">'+money(i.amountPaise)+' · '+esc(i.status)+' · UTR '+esc(i.utr)+'</option>').join('');return'<div class="support-page"><div class="section-head with-action"><div><span class="kicker">CUSTOMER CARE</span><h2>Help & Support</h2><p class="section-subcopy">Threaded conversations, historical references, and replies.</p></div><button class="refresh-btn" type="button" data-action="refresh-support">'+(state.supportLoading?'Refreshing…':'Refresh')+'</button></div>'+(state.supportError?'<div class="panel active-sync-error" role="alert"><span>'+esc(state.supportError)+'</span><button class="refresh-btn" type="button" data-action="refresh-support">Retry</button></div>':'')+'<section class="support-form-panel panel"><div class="panel-head"><div><h3>Report an issue</h3><span>Link an activation or recharge when possible.</span></div><span class="status-chip">SECURE THREAD</span></div><form id="support-form" class="support-form"><div class="support-form-grid"><label>Issue type<select name="category">'+SUPPORT_CATEGORIES.map(([id,label])=>'<option value="'+id+'" '+(form.category===id?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label>Subject<input name="subject" maxlength="120" value="'+esc(form.subject||'')+'" required></label></div><label>Message<textarea name="message" maxlength="2000" rows="5" required>'+esc(form.message||'')+'</textarea></label><div class="support-form-grid"><label>Activation reference<select name="activationId"><option value="">Not linked</option>'+activeOptions+'</select></label><label>Recharge reference<select name="rechargeId"><option value="">Not linked</option>'+rechargeOptions+'</select></label></div><div class="support-form-actions"><span>Never share passwords, OTPs, or card PINs here.</span><button class="primary-btn" type="submit" '+(state.supportSubmitting?'disabled':'')+'>'+(state.supportSubmitting?'Sending…':'Create support ticket')+'</button></div></form></section>'+supportRecoveryCards()+(tickets.length?'<section class="support-tickets"><div class="section-head recent-section-head"><div><span class="kicker">YOUR TICKETS</span><h3>Support threads</h3></div><span class="result-note">'+tickets.length+' shown</span></div><div class="support-ticket-list">'+tickets.map(supportTicketCard).join('')+'</div></section>':'<div class="panel support-empty"><div class="empty-icon">?</div><h3>No support threads</h3><p>Create a thread when you need help.</p></div>')+'</div>';}
function content() {
  if (state.loading) return `<div class="service-grid customer-service-grid catalog-initial-loading">${catalogLoadingMarkup()}</div>`;
  if (state.page === 'active') return activePage();
  if (state.page === 'orders') return ordersPage();
  if (state.page === 'wallet') return walletPage();
  if (state.page === 'support') return supportPage();
  if (state.page === 'account') return accountPage();
  if (state.page === 'api') return apiPage();
  if (state.page === 'admin') return adminPage();
  return buyPage();
}



function serviceCard(service) {
  const insufficient = state.balancePaise < Number(service.pricePaise || 0);
  const actionLabel = insufficient ? 'Top up' : 'Buy number';
  const expanded = state.expandedServiceId === service.id;
  const priceLabel = money(service.pricePaise);
  const balanceDelta = Number(service.pricePaise || 0) - state.balancePaise;
  const balanceReady = !insufficient;
  const walletLabel = balanceReady ? 'Wallet ready' : 'Add ' + money(Math.max(0, balanceDelta));
  return '<article class="market-service-group customer-service-card ' + (expanded ? ' expanded' : '') + '">' +
    '<button class="service-group-header customer-service-main" type="button" data-toggle-service="' + esc(service.id) + '" aria-expanded="' + String(expanded) + '" aria-controls="details-' + esc(service.id) + '">' +
      '<span class="service-icon service-brand-icon">' + iconFor(service.category) + '</span>' +
      '<span class="service-group-copy"><span class="service-category">' + esc(service.category) + '</span><strong>' + esc(service.name) + '</strong><small>+91 · Up to 25 min validity · OTP timing varies</small></span>' +
      '<span class="service-group-meta"><span class="service-price">' + priceLabel + '</span></span>' +
      '<span class="service-group-chevron" aria-hidden="true">⌄</span>' +
    '</button>' +
    '<div class="customer-service-bottom"><div class="customer-service-facts"><span class="customer-service-fact"><b>25 min</b> maximum validity</span><span class="customer-service-fact"><b>+91</b> number format</span><span class="customer-service-fact"><b>Varies</b> OTP delivery</span></div><div class="customer-service-action"><span class="wallet-ready-chip ' + (balanceReady ? 'ready' : 'needs-funds') + '">' + esc(walletLabel) + '</span><button class="buy-btn customer-buy" type="button" data-buy-service="' + esc(service.id) + '">' + actionLabel + '</button></div></div>' +
    (expanded ? serviceDetailsMarkup() : '') +
  '</article>';
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
  const freshness = catalogFreshnessText();
  const catalogUnavailable = Boolean(state.catalogError && !state.services.length && !state.catalogLoading);
  const recentServices = recentlyUsedServices();
  const recentBlock = recentServices.length
    ? `<section class="market-recent" aria-label="Recently used services"><div class="market-recent-head"><div><span class="kicker">QUICK START</span><h3>Recently used</h3></div><span class="result-note">From your latest activations</span></div><div class="recent-service-chips">${recentServices.map((service) => `<button class="recent-service-chip" type="button" data-buy-recent-service="${esc(service.id)}"><span class="service-icon">${iconFor(service.category)}</span><span><strong>${esc(service.name)}</strong><small>${esc(service.category)} · ${money(service.pricePaise)}</small></span><b>→</b></button>`).join('')}</div></section>`
    : '';
  return `<div class="market-page" id="marketplace-services">
    ${recentBlock}
    <div class="section-head market-section-head">
      <div><span class="kicker">MARKETPLACE / +91</span><h2>Choose a service</h2><p class="section-subcopy">Pick the service you need. Choose a service, review the price, and start your activation.</p></div>
      <div class="market-summary"><span class="summary-dot"></span><strong>${list.length.toLocaleString()}</strong><span>matches</span></div>
    </div>
    <div class="market-country-strip"><div class="market-country-pill"><div><strong>+91 number format</strong><small>Supported marketplace format</small></div></div><div class="country-note">Number format is shown before activation</div></div>
    <div class="controls market-controls">
      <div class="toolbar market-toolbar">
        <label class="search-box premium-search" aria-label="Search services"><span class="search-glyph">⌕</span><input id="service-search" value="${esc(state.search)}" placeholder="Search ${state.services.length.toLocaleString()} services…" autocomplete="off" spellcheck="false"><kbd>/</kbd></label>
        <div class="category-scroll-wrap"><div class="category-scroll" role="group" aria-label="Service categories">${state.catalogCategories.map((category) => `<button class="filter-btn ${state.category === category ? "selected" : ""}" type="button" data-category="${esc(category)}" aria-pressed="${state.category === category}"><span>${esc(category)}</span><span class="filter-count">${(state.categoryCounts[category] || 0).toLocaleString()}</span></button>`).join("")}</div></div>
      </div>
    </div>
    <div class="market-results-bar"><span class="result-note market-result-count" aria-live="polite">${esc(marketResultText(list.length, showing))}</span><span class="market-freshness ${catalogUnavailable ? 'stale' : ''}">${esc(freshness)}</span><span class="market-filter-state ${hasActiveMarketplaceFilters() ? 'active' : ''}">${hasActiveMarketplaceFilters() ? 'Filters active' : 'All services'}</span><button class="market-clear-btn" type="button" data-clear-market${hasActiveMarketplaceFilters() ? '' : ' hidden'}>Clear</button><span class="market-hint">Final activation eligibility is confirmed when you start an activation</span></div>
    <div class="service-grid customer-service-grid">${catalogUnavailable ? catalogEmptyMarkup() : marketListMarkup(list)}</div>
    <div class="purchase-flow-root">${purchaseReviewModal()}</div>
  </div>`;
}
function activePage() {
  const activeCount = state.active.length;
  const recent = Array.isArray(state.recentActivations) ? state.recentActivations : [];
  const justReceived = recent.filter(isJustReceivedCode);
  const olderRecent = recent.filter((activation) => !isJustReceivedCode(activation));
  const syncLabel = state.customerDataRefreshing
    ? 'Checking live status…'
    : state.lastActivationSyncAt
      ? 'Checked ' + Math.max(1, Math.floor((Date.now() - state.lastActivationSyncAt) / 1000)) + 's ago'
      : 'Live status';
  const errorBlock = state.activeSyncError
    ? '<div class="panel active-sync-error" role="alert"><span>' + esc(state.activeSyncError) + '</span><button class="refresh-btn" type="button" data-action="refresh-customer">Retry</button></div>'
    : '';
  const liveBlock = activeCount
    ? '<div class="active-list">' + state.active.map(activeCard).join('') + '</div>'
    : '<div class="panel empty active-empty"><div class="empty-icon">▤</div><h3>No active numbers</h3><p>Reserve a number from the marketplace and the activation will appear here.</p><button class="refresh-btn empty-state-action" type="button" data-page="buy">Browse services</button></div>';
  const receivedBlock = justReceived.length
    ? '<section class="active-received-section"><div class="section-head recent-section-head"><div><span class="kicker">CODE RECEIVED</span><h3>Ready to use</h3></div><span class="result-note">Recent activations</span></div><div class="active-received-list">' + justReceived.map(receivedCodeCard).join('') + '</div></section>'
    : '';
  const recentBlock = olderRecent.length
    ? '<section class="recent-activation-section"><div class="section-head recent-section-head"><div><span class="kicker">RECENT</span><h3>Recently finished</h3></div><span class="result-note">Last 15 minutes</span></div><div class="recent-activation-list">' + olderRecent.map(recentActivationCard).join('') + '</div></section>'
    : '';
  return '<div class="section-head with-action"><div><span class="kicker">LIVE SESSION</span><h2>Active numbers</h2></div><div class="page-head-actions"><span class="status-chip">● ' + activeCount + ' active</span><span class="result-note active-sync-label">' + syncLabel + '</span><button class="refresh-btn" type="button" data-action="refresh-customer">' + (state.customerDataRefreshing ? 'Refreshing…' : 'Refresh') + '</button></div></div>' + errorBlock + liveBlock + receivedBlock + recentBlock;
}

function isJustReceivedCode(activation) {
  return String(activation?.status || '') === 'Completed' &&
    Boolean(String(activation?.otp || '').trim()) &&
    (!activation.createdAt || Number(activation.createdAt) >= Date.now() - 3 * 60 * 1000);
}

function receivedCodeCard(activation) {
  const service = state.services.find((s) => s.id === activation.serviceId);
  const otp = String(activation.otp || '').trim();
  return '<article class="received-code-card"><div class="received-code-main"><div class="service-icon large">' + iconFor(service?.category) + '</div><div class="received-code-copy"><span>' + esc(activation.service) + '</span><strong>' + esc(activation.number) + '</strong><small>Code received · Activation finished</small></div></div><div class="received-code-value"><span>VERIFICATION CODE</span><strong>' + esc(otp) + '</strong><button class="primary-btn otp-copy-primary" type="button" data-copy="' + esc(otp.replace(/\s/g, '')) + '" data-copy-message="OTP copied">Copy code</button></div><div class="received-code-footer"><span>Order ' + esc(activation.id) + '</span><button class="ghost-btn" type="button" data-page="orders">View order</button></div></article>';
}


function recentActivationCard(activation) {
  const completed = activation.status === 'Completed';
  const otp = String(activation.otp || '');
  const service = state.services.find((s) => s.id === activation.serviceId);
  const when = activation.createdAt ? new Date(activation.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently';
  return '<article class="recent-activation-card ' + (completed ? 'completed' : '') + '"><div class="recent-activation-main"><div class="service-icon">' + iconFor(service?.category) + '</div><div class="recent-activation-copy"><span>' + esc(activation.service) + '</span><strong>' + esc(activation.number) + '</strong><small>' + esc(activation.status) + ' · ' + esc(when) + '</small></div></div>' + (completed && otp ? '<div class="recent-otp"><span>OTP</span><strong>' + esc(otp) + '</strong><button class="copy-btn" type="button" data-copy="' + esc(otp.replace(/\\s/g, '')) + '" data-copy-message="OTP copied">Copy OTP</button></div>' : '<span class="recent-status">' + esc(activation.status) + '</span>') + '</article>';
}



function renderActiveOnly() {
  const node = document.getElementById('content');
  if (node) node.innerHTML = activePage();
  bindEvents();
}

function activeCard(activation) {
  const status = String(activation.status || 'Active');
  const otp = String(activation.otp || '').trim();
  const expiresAt = Number(activation.expiresAt || 0);
  const createdAt = Number(activation.createdAt || 0);
  const syntheticRevealAt = Number(activation.syntheticNumberRevealAt || activation.metadata?.numberRevealAt || 0);
  const syntheticOtpAt = Number(activation.syntheticOtpAvailableAt || activation.mockOtpAt || 0);
  const syntheticNumberHidden = status === 'Active' && !otp && syntheticRevealAt > Date.now();
  const syntheticOtpWaiting = status === 'Active' && !otp && !syntheticNumberHidden && syntheticOtpAt > Date.now();
    const cancelling = state.activeCancelId === activation.id;
  const cancelBusy = state.activeCancelBusy.has(activation.id);
  const actionError = state.activeActionErrorById[activation.id] || '';
  const service = state.services.find((s) => s.id === activation.serviceId);
  const statusInfo = {
    Active: otp
      ? { label: 'Code received', tone: 'received' }
      : syntheticNumberHidden
        ? { label: 'Waiting for number', tone: 'waiting' }
        : syntheticOtpWaiting
          ? { label: 'Waiting for OTP', tone: 'waiting' }
          : { label: 'Waiting for SMS', tone: 'waiting' },
    CancellationPending: { label: 'Cancellation in progress', tone: 'pending' },
    ExpirationPending: { label: 'Expiring', tone: 'pending' }
  }[status] || { label: status, tone: 'neutral' };
  const canCancel = status === 'Active' && !otp && !cancelBusy;
  const cancelUi = cancelling
    ? '<div class="cancel-confirm"><span>Cancel this activation and request a refund.</span><div><button class="ghost-btn" type="button" data-cancel-dismiss>Keep number</button><button class="text-danger confirm-danger" type="button" data-cancel-confirm="' + esc(activation.id) + '">Confirm cancel</button></div></div>'
    : (canCancel ? '<button class="text-danger" type="button" data-cancel="' + esc(activation.id) + '">Cancel & refund</button>' : '<span class="cancel-disabled-note">' + (status === 'CancellationPending' ? 'Cancellation processing' : status === 'ExpirationPending' ? 'Expiration processing' : otp ? 'Code received' : 'Not cancellable') + '</span>');
  const syntheticOtpWaitingLabel = syntheticOtpWaiting;
  const otpPanel = otp
    ? '<div class="otp-panel otp-received-panel"><div class="otp-panel-head"><span class="otp-label">VERIFICATION CODE</span><span class="code-state success">READY</span></div><div class="otp-code">' + esc(otp) + '</div><div class="otp-actions"><button class="primary-btn otp-copy-primary" type="button" data-copy="' + esc(otp.replace(/\s/g, '')) + '" data-copy-message="OTP copied">Copy code</button><span class="otp-help">Use the code shown here to complete verification.</span></div></div>'
    : syntheticNumberHidden
      ? '<div class="otp-panel waiting-panel"><div class="otp-panel-head"><span class="otp-label">NUMBER</span><span class="code-state waiting">WAITING</span></div><div class="waiting-note">▣ Waiting for number</div></div>'
      : '<div class="otp-panel waiting-panel"><div class="otp-panel-head"><span class="otp-label">' + (syntheticOtpWaitingLabel ? 'OTP' : 'STATUS') + '</span><span class="code-state ' + esc(statusInfo.tone) + '">' + esc(statusInfo.label.toUpperCase()) + '</span></div><div class="waiting-note">' + (status === 'CancellationPending' ? '◷ Cancellation is being processed' : status === 'ExpirationPending' ? '◷ Finalizing this activation' : syntheticOtpWaitingLabel ? '▣ Waiting for OTP' : '▣ Waiting for the verification code') + '</div></div>';
  const errorBlock = actionError ? '<div class="active-action-error" role="alert"><span>' + esc(actionError) + '</span><button class="refresh-btn" type="button" data-action="refresh-activation" data-refresh-activation="' + esc(activation.id) + '">Check status</button></div>' : '';
  const displayNumber = syntheticNumberHidden ? 'Waiting for number' : activation.number;
  const copyNumber = syntheticNumberHidden
    ? '<span class="copy-btn disabled" aria-disabled="true">Preparing…</span>'
    : '<button class="copy-btn" type="button" data-copy="' + esc(activation.number.replace(/\s/g, '')) + '" data-copy-message="Number copied">Copy number</button>';
  return '<article class="active-card ' + (cancelBusy ? 'is-cancelling' : '') + ' ' + esc(statusInfo.tone) + '">' +
    '<div class="active-card-header"><div class="service-icon large">' + iconFor(service?.category) + '</div><div class="service-meta"><span class="service-category">' + esc(activation.service) + '</span><h3>' + esc(displayNumber) + '</h3></div><span class="activation-status ' + esc(statusInfo.tone) + '"><span></span>' + (cancelBusy ? 'Cancelling…' : esc(statusInfo.label)) + '</span></div>' +
    '<div class="active-context"><span>+91 number format</span><span>' + money(activation.pricePaise) + '</span><span>Order ' + esc(activation.id) + '</span>' + copyNumber + '</div>' +
    otpPanel + errorBlock +
    '<div class="active-footer"><span><small>ACTIVATION</small><strong>' + (status === 'CancellationPending' ? 'Cancellation in progress' : status === 'ExpirationPending' ? 'Expiration in progress' : 'Number valid for up to 25 minutes') + '</strong></span>' + cancelUi + '</div>' +
  '</article>';
}


function orderStatusClass(status) {
  return String(status || 'Unknown').toLowerCase().replace(/[^a-z]+/g, '-');
}

function filteredOrders() {
  const source = Array.isArray(state.orders) ? state.orders : [];
  if (state.orderFilter === 'active') return source.filter((order) => ['Active', 'Waiting'].includes(String(order.status)));
  if (state.orderFilter === 'completed') return source.filter((order) => ['Completed', 'Expired', 'Cancelled', 'Refunded'].includes(String(order.status)));
  return source;
}

function orderCard(order) {
  const expanded = state.expandedOrderId === order.id;
  const status = String(order.status || 'Unknown');
  const otpReady = order.otp && !['Waiting…', '—'].includes(String(order.otp));
  const detail = expanded
    ? '<div class="order-detail-grid"><div><span>Order ID</span><strong>' + esc(order.id) + '</strong></div><div><span>Number</span><strong>' + esc(order.number || '—') + '</strong></div><div><span>Amount</span><strong>' + money(order.pricePaise) + '</strong></div><div><span>Created</span><strong>' + esc(order.created || '—') + '</strong></div></div>'
    : '';
  const otp = otpReady
    ? '<div class="order-otp"><span>OTP</span><strong>' + esc(order.otp) + '</strong><button class="copy-btn" type="button" data-copy="' + esc(String(order.otp).replace(/\\s/g, '')) + '" data-copy-message="OTP copied">Copy</button></div>'
    : '<span class="order-otp-wait">' + esc(status === 'Active' ? 'OTP waiting' : 'OTP not available') + '</span>';
  return '<article class="order-card ' + (expanded ? 'expanded' : '') + '"><button class="order-card-main" type="button" data-order-toggle="' + esc(order.id) + '" aria-expanded="' + String(expanded) + '">' +
    '<div class="order-service-icon">' + iconFor(state.services.find((service) => service.id === order.serviceId)?.category) + '</div>' +
    '<div class="order-card-copy"><span>' + esc(order.service || 'Service') + '</span><strong>' + esc(order.number || 'Number reserved') + '</strong><small>' + esc(order.created || 'Recently') + '</small></div>' +
    '<span class="table-status ' + orderStatusClass(status) + '">' + esc(status) + '</span>' +
    '<span class="order-card-price">' + money(order.pricePaise) + '</span><span class="order-card-chevron" aria-hidden="true">⌄</span></button>' +
    '<div class="order-card-body">' + otp + '</div>' + detail + '</article>';
}

function ordersPage() {
  const list = filteredOrders();
  const activeCount = state.orders.filter((order) => ['Active', 'Waiting'].includes(String(order.status))).length;
  const completedCount = state.orders.filter((order) => ['Completed', 'Expired', 'Cancelled', 'Refunded'].includes(String(order.status))).length;
  const filterButtons = [['all', 'All'], ['active', 'Active'], ['completed', 'Finished']].map(([value, label]) =>
    '<button class="filter-btn ' + (state.orderFilter === value ? 'selected' : '') + '" type="button" data-order-filter="' + value + '">' + label + '<span class="filter-count">' + (value === 'all' ? state.orders.length : value === 'active' ? activeCount : completedCount) + '</span></button>'
  ).join('');
  const body = list.length
    ? '<div class="orders-table"><div class="orders-card-list">' + list.map(orderCard).join('') + '</div></div>'
    : '<div class="panel empty"><div class="empty-icon">▤</div><h3>No matching orders</h3><p>Your activations and completed transactions will appear here automatically.</p><button class="refresh-btn empty-state-action" type="button" data-action="refresh-customer">Refresh orders</button></div>';
  return '<div class="section-head with-action"><div><span class="kicker">ACCOUNT ACTIVITY</span><h2>Orders</h2><p class="section-subcopy">A transaction timeline for your number activations.</p></div><div class="page-head-actions"><span class="status-chip">' + state.orders.length + ' total</span><button class="refresh-btn" type="button" data-action="refresh-customer">' + (state.customerDataRefreshing ? 'Refreshing…' : 'Refresh') + '</button></div></div>' +
    '<div class="order-summary-strip"><div><span>Active</span><strong>' + activeCount + '</strong></div><div><span>Finished</span><strong>' + completedCount + '</strong></div><div><span>Tracked</span><strong>' + state.orders.length + '</strong></div></div>' +
    '<div class="order-filter-row" role="group" aria-label="Order filters">' + filterButtons + '</div>' + body;
}


function walletSummary(){const s=state.walletSummary||{};return{credits:Number(s.creditPaise||0),debits:Number(s.debitPaise||0),pending:Number(s.pendingPaise||0),creditCount:Number(s.creditCount||0),debitCount:Number(s.debitCount||0),pendingCount:Number(s.pendingCount||0)};}
function walletActivityItems(){const ledger=(state.walletLedger||[]).map(e=>({id:'ledger:'+e.id,source:'ledger',type:e.type==='credit'?'credit':'debit',title:e.description||'Wallet transaction',amountPaise:Number(e.amountPaise||0),createdAt:Number(e.createdAt||0),referenceType:e.referenceType||'',referenceId:e.referenceId||''}));const recharges=(state.recharges||[]).map(e=>({id:'recharge:'+e.id,source:'recharge',type:'recharge',title:'Wallet recharge',amountPaise:Number(e.amountPaise||0),createdAt:Number(e.submittedAt||0),status:String(e.status||'Pending'),utr:e.utr||'',reviewedAt:e.reviewedAt||null,rejectionReason:e.rejectionReason||''}));return[...ledger,...recharges].sort((a,b)=>b.createdAt-a.createdAt);}
function filteredWalletActivity(){const items=walletActivityItems();if(state.walletFilter==='credits')return items.filter(i=>i.type==='credit');if(state.walletFilter==='debits')return items.filter(i=>i.type==='debit');if(state.walletFilter==='recharges')return items.filter(i=>i.source==='recharge');return items;}
function walletStatusLabel(i){if(i.source==='ledger')return i.type==='credit'?'Credited':'Charged';if(i.status==='Approved')return'Verified & credited';if(i.status==='Rejected')return'Rejected · not credited';return'Awaiting verification';}
function walletActivityCard(i){const expanded=state.expandedWalletTransactionId===i.id;const detail=expanded?'<div class="wallet-transaction-detail"><div><span>Status</span><strong>'+esc(walletStatusLabel(i))+'</strong></div><div><span>Created</span><strong>'+esc(i.createdAt?new Date(i.createdAt).toLocaleString():'—')+'</strong></div>'+(i.referenceId?'<div><span>Reference</span><strong>'+esc((i.referenceType?i.referenceType+' · ':'')+i.referenceId)+'</strong></div>':'')+(i.utr?'<div><span>UTR</span><strong>'+esc(i.utr)+'</strong></div>':'')+(i.reviewedAt?'<div><span>Reviewed</span><strong>'+esc(new Date(i.reviewedAt).toLocaleString())+'</strong></div>':'')+(i.rejectionReason?'<div><span>Reason</span><strong>'+esc(i.rejectionReason)+'</strong></div>':'')+'</div>':'';
const tone=i.source==='recharge'?(i.status==='Rejected'?'rejected':i.status==='Approved'?'approved':'pending'):(i.type==='credit'?'approved':'debit');const amount=(i.source==='recharge'?'':(i.type==='credit'?'+ ':'− '))+money(i.amountPaise);return'<article class="wallet-transaction '+tone+'"><button class="wallet-transaction-main" type="button" data-wallet-detail="'+esc(i.id)+'" aria-expanded="'+String(expanded)+'"><span class="wallet-transaction-icon">'+(i.source==='recharge'?'↥':i.type==='credit'?'+':'−')+'</span><span class="wallet-transaction-copy"><strong>'+esc(i.title)+'</strong><small>'+esc(i.createdAt?new Date(i.createdAt).toLocaleString():'—')+'</small></span><span class="wallet-transaction-status">'+esc(walletStatusLabel(i))+'</span><strong class="wallet-transaction-amount">'+esc(amount)+'</strong><span aria-hidden="true">⌄</span></button>'+detail+'</article>';}
function walletPage(){
  const summary=walletSummary(),activity=filteredWalletActivity();
  const filters=[['all','All'],['credits','Money in'],['debits','Money out'],['recharges','Recharges']].map(([v,l])=>'<button class="filter-btn '+(state.walletFilter===v?'selected':'')+'" type="button" data-wallet-filter="'+v+'">'+l+'</button>').join('');
  const paymentSettings=state.rechargePaymentSettings||{};
  const rechargeReady=Boolean(state.persistentState&&state.rechargeEnabled&&paymentSettings.upiId);
  const qrImage=paymentSettings.qrImage
    ? '<div class="recharge-qr-wrap"><img class="recharge-qr" src="'+esc(paymentSettings.qrImage)+'" alt="INBOX9 UPI payment QR code" loading="lazy"></div>'
    : '<div class="recharge-qr-empty"><strong>QR not configured</strong><span>Use the UPI ID below or ask support for the current payment QR.</span></div>';
  const upiLink=upiIntentUrl(state.rechargeAmount,paymentSettings);
  const funding=rechargeReady
    ? '<div class="recharge-flow panel"><div class="recharge-flow-head"><div><span class="kicker">WALLET FUNDING</span><h3>Add funds by UPI</h3><p>Pay the exact amount, then submit the UTR. Wallet changes only after verification.</p></div><span class="status-chip">MANUAL VERIFY</span></div><p class="recharge-progress-copy">Pay → Submit UTR → Admin verifies → Wallet credited</p><div class="recharge-steps"><span class="done"><b>1</b> Pay</span><i></i><span class="current"><b>2</b> Submit</span><i></i><span><b>3</b> Verify</span></div><div class="recharge-grid"><div class="panel payment-panel recharge-payment-visual"><div class="panel-head"><div><h3>Scan or open UPI</h3><span>Merchant: '+esc(paymentSettings.merchantName||'INBOX9')+'</span></div></div><div class="recharge-qr-card">'+qrImage+'</div><div class="upi-row"><span>UPI ID</span><code>'+esc(paymentSettings.upiId)+'</code><button class="copy-btn" type="button" data-copy="'+esc(paymentSettings.upiId)+'" data-copy-message="UPI ID copied">Copy</button></div><a class="primary-btn recharge-upi-intent" data-upi-intent href="'+esc(upiLink)+'">Open UPI app <span>↗</span></a><p class="form-note">'+esc(paymentSettings.instructions||'Pay the exact amount shown below. Keep the UTR / transaction reference after payment.')+'</p></div><div class="panel payment-panel"><div class="panel-head"><div><h3>Submit payment</h3><span>Exact amount + UTR are required.</span></div></div><form id="recharge-form" class="recharge-form"><label>Amount (₹)<input id="recharge-amount" name="amount" type="number" min="100" max="5000" step="1" value="'+state.rechargeAmount+'" required></label><div class="amount-presets">'+[100,500,1000,2000,5000].map(a=>'<button type="button" class="filter-btn '+(state.rechargeAmount===a?'selected':'')+'" data-recharge-amount="'+a+'">₹'+a+'</button>').join('')+'</div><label>UTR / Transaction reference<input name="utr" type="text" minlength="4" maxlength="64" autocomplete="off" placeholder="Enter UTR after payment" required></label><button class="primary-btn" type="submit" '+(state.rechargeSubmitting?'disabled':'')+'>'+(state.rechargeSubmitting?'Submitting…':'Submit for verification')+'</button><p class="form-note">Submitted requests stay Pending until an authorized admin verifies the actual received payment. No client-side callback can credit the wallet.</p></form></div></div></div>'
    : '<div class="panel payment-panel"><div class="panel-head"><div><h3>Wallet funding unavailable</h3><span>'+(state.persistentState?'Recharge is not configured yet. An admin must set the merchant UPI destination.':'Payments are disabled in this environment.')+'</span></div><span class="status-chip">'+(state.persistentState?'SETUP REQUIRED':'PAYMENTS OFF')+'</span></div></div>';
  return '<div class="section-head with-action"><div><span class="kicker">WALLET / INR</span><h2>Wallet</h2><p class="section-subcopy">Recharge status, transaction filters, and transaction detail.</p></div><button class="refresh-btn" type="button" data-action="refresh-customer">'+(state.customerDataRefreshing?'Refreshing…':'Refresh')+'</button></div><div class="wallet-summary-grid"><div class="balance-card"><div class="wallet-card-top"><span>AVAILABLE BALANCE</span><span>INR</span></div><strong>'+money(state.balancePaise)+'</strong><small>Authoritative wallet balance</small></div><div class="wallet-stat-card"><span>LEDGER CREDITS</span><strong>'+money(summary.credits)+'</strong><small>'+summary.creditCount+' recorded credits</small></div><div class="wallet-stat-card"><span>LEDGER DEBITS</span><strong>'+money(summary.debits)+'</strong><small>'+summary.debitCount+' recorded debits</small></div><div class="wallet-stat-card pending"><span>PENDING TOP-UPS</span><strong>'+money(summary.pending)+'</strong><small>'+summary.pendingCount+' awaiting review</small></div></div>'+funding+'<section class="panel wallet-activity-panel"><div class="panel-head"><div><h3>Transactions</h3><span>Money movement and recharge requests in one timeline.</span></div><span class="status-chip">'+activity.length+' shown</span></div><div class="wallet-filter-row">'+filters+'</div><div class="wallet-transaction-list">'+(activity.length?activity.map(walletActivityCard).join(''):'<div class="empty-mini">No transactions match this filter.</div>')+'</div></section><section class="panel wallet-recharge-history"><div class="panel-head"><div><h3>Recharge history</h3><span>Semantic payment outcomes</span></div></div>'+(state.recharges.length?'<div class="recharge-history">'+state.recharges.slice(0,10).map(r=>'<div class="recharge-history-row"><div><strong>'+money(r.amountPaise)+'</strong><span>UTR '+esc(r.utr)+'</span></div><span class="table-status '+String(r.status||'Pending').toLowerCase()+'">'+esc(walletStatusLabel({source:'recharge',status:r.status}))+'</span></div>').join('')+'</div>':'<div class="empty-mini">No recharge requests yet.</div>')+'</section>';
}
function refreshAccount(){if(!state.user)return false;state.accountLoading=true;state.accountError='';return Promise.all([api('/api/auth/sessions'),api('/api/auth/me')]).then(([sessions,me])=>{state.accountSessions=Array.isArray(sessions.sessions)?sessions.sessions:[];if(me.user)state.user=me.user;return true;}).catch(error=>{if(Number(error.status)===401){handleSessionExpired();return false;}state.accountError=error.message||'Account data unavailable';return false;}).finally(()=>{state.accountLoading=false;});}
function saveProfile(event){event.preventDefault();const displayName=String(new FormData(event.currentTarget).get('displayName')||'').trim();api('/api/auth/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName})}).then(p=>{state.user=p.user;toast('Profile saved');render();}).catch(error=>toast(error.message));}
function generateRecoveryCode(){if(state.accountRecoveryBusy)return;state.accountRecoveryBusy=true;state.accountRecoveryCode='';render();api('/api/auth/recovery-code',{method:'POST'}).then(p=>{state.accountRecoveryCode=p.code||'';toast('Recovery code generated');}).catch(error=>toast(error.message)).finally(()=>{state.accountRecoveryBusy=false;render();});}
function revokeSession(id){api('/api/auth/sessions/'+encodeURIComponent(id),{method:'DELETE'}).then(result=>{if(result.current){handleSessionSignedOut();return;}return refreshAccount().then(()=>{render();toast('Session signed out');});}).catch(error=>toast(error.message));}
function accountPage(){const user=state.user||{},sessions=Array.isArray(state.accountSessions)?state.accountSessions:[];const rows=sessions.length?sessions.map(sess=>'<div class="account-session-row"><div><strong>'+esc(sess.current?'Current session':'Signed-in session')+'</strong><small>Started '+esc(sess.createdAt?new Date(sess.createdAt).toLocaleString():'—')+' · Last active '+esc(sess.lastUsedAt?new Date(sess.lastUsedAt).toLocaleString():'—')+'</small></div><span>'+(sess.current?'<span class="status-chip">CURRENT</span>':'<button class="filter-btn" type="button" data-revoke-session="'+esc(sess.id)+'">Sign out</button>')+'</span></div>').join(''):'<div class="empty-mini">No active session records are available.</div>';return'<div class="account-page"><div class="section-head with-action"><div><span class="kicker">ACCOUNT</span><h2>Account</h2><p class="section-subcopy">Profile, password recovery, and signed-in sessions.</p></div><button class="refresh-btn" type="button" data-action="refresh-account">'+(state.accountLoading?'Refreshing…':'Refresh')+'</button></div>'+(state.accountError?'<div class="panel active-sync-error" role="alert"><span>'+esc(state.accountError)+'</span><button class="refresh-btn" type="button" data-action="refresh-account">Retry</button></div>':'')+'<div class="account-grid"><section class="panel account-card"><div class="panel-head"><div><h3>Profile</h3><span>Set a display name.</span></div></div><form id="profile-form" class="account-form"><label>Display name<input name="displayName" maxlength="64" value="'+esc(user.displayName||'')+'" placeholder="Your display name"></label><label>Email<input value="'+esc(user.email||'')+'" readonly aria-readonly="true"></label><button class="primary-btn" type="submit">Save profile</button></form></section><section class="panel account-card"><div class="panel-head"><div><h3>Password</h3><span>Changing it signs out other sessions.</span></div></div><form id="change-password-form" class="security-form"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button class="primary-btn" type="submit">Change password</button></form></section></div><section class="panel account-card"><div class="panel-head"><div><h3>Recovery code</h3><span>Generate while signed in and store it offline.</span></div><button class="secondary-btn" type="button" data-generate-recovery '+(state.accountRecoveryBusy?'disabled':'')+'>'+(state.accountRecoveryBusy?'Generating…':'Generate code')+'</button></div>'+(state.accountRecoveryCode?'<div class="recovery-code-box" role="alert"><span>YOUR RECOVERY CODE</span><strong>'+esc(state.accountRecoveryCode)+'</strong><div><button class="primary-btn" type="button" data-copy="'+esc(state.accountRecoveryCode)+'" data-copy-message="Recovery code copied">Copy code</button><small>A new code invalidates the previous unused code.</small></div></div>':'<div class="account-note">The recovery code is shown only after generation.</div>')+'</section><section class="panel account-card"><div class="panel-head"><div><h3>Active sessions</h3><span>7-day sessions · up to 5 retained by default.</span></div><button class="buy-btn" type="button" data-action="logout-all">Sign out all</button></div><div class="account-session-list">'+rows+'</div></section></div>';}
function apiPage() {
  return `<div class="section-head"><div><span class="kicker">OPERATIONS</span><h2>API foundation</h2></div><span class="status-chip">ADMIN ONLY</span></div><div class="api-grid"><div class="panel api-card"><div class="api-title"><div class="info-icon">ϟ</div><div><h3>Provider adapter contract</h3><p>Upstream integrations stay behind a server-only adapter and never leak provider credentials to the browser.</p></div></div><pre>interface ProviderAdapter {
  listServices(): Promise&lt;Service[]&gt;
  reserveNumber(input): Promise&lt;Activation&gt;
  getActivation(id): Promise&lt;Activation&gt;
  cancelActivation(id): Promise&lt;Refund&gt;
}</pre></div><div class="panel api-card"><div class="api-title"><div class="info-icon">⌘</div><div><h3>HTTP surface</h3><p>Production auth, rate limiting, idempotency and persistence sit in front of these routes.</p></div></div>${[['GET','/api/health'],['POST','/api/auth/change-password'],['POST','/api/auth/logout-all'],['GET','/api/services'],['GET','/api/wallet'],['POST','/api/recharges'],['GET','/api/activations'],['POST','/api/activations'],['GET','/api/activations/:id'],['POST','/api/activations/:id/cancel'],['GET','/api/admin/overview'],['GET','/api/admin/recharges'],['POST','/api/admin/recharges/:id'],['GET','/api/admin/services'],['PATCH','/api/admin/services/:id'],['GET','/api/admin/users'],['GET','/api/admin/activations'],['GET','/api/admin/ledger'],['GET','/api/admin/providers'],['GET','/api/admin/providers-health'],['GET','/api/admin/audit']].map(([method, path]) => `<div class="endpoint"><span class="method ${method.toLowerCase()}">${method}</span><code>${path}</code><span>↗</span></div>`).join('')}</div></div>`;
}

let lastForegroundRefreshAt = 0;

function handleBrowserNavigation() {
  if (!state.user) return;
  handleMarketplaceUrlNavigation();
  handleHashNavigation({ refreshSamePage: false });
}

function handlePageShow(event) {
  if (!state.user || !event.persisted) return;
  lastForegroundRefreshAt = 0;
  handleCustomerVisibilityRefresh();
}

function handlePageHide(event) {
  // Prevent a hard reload from leaving the previous authenticated page visible
  // while the browser fetches the next document. Keep BFCache restores intact.
  if (event.persisted) return;
  showStartupSplash();
}

function handleCustomerVisibilityRefresh() {
  if (document.visibilityState !== 'visible' || !state.user) return;
  const now = Date.now();
  if (now - lastForegroundRefreshAt < 15_000) return;
  lastForegroundRefreshAt = now;
  void loadCustomerData({ silent: true }).then(() => {
    if (state.page === 'active') renderActiveOnly();
  });
}

function bindEvents() {
  document.getElementById('auth-form')?.addEventListener('submit', submitAuth);
  document.querySelectorAll('[data-auth-mode]').forEach((node) => node.addEventListener('click', () => { state.authMode = node.dataset.authMode; state.bootstrapError = ''; render(); }));
  document.querySelectorAll('[data-action="retry-bootstrap"]').forEach((node) => node.addEventListener('click', () => void retryBootstrap()));
  document.querySelectorAll('[data-action="logout"]').forEach((node) => node.addEventListener('click', logout));
  document.querySelectorAll('[data-action="security"]').forEach((node) => node.addEventListener('click', openSecurity));
  document.querySelectorAll('[data-action="close-security"]').forEach((node) => node.addEventListener('click', closeSecurity));
  document.querySelectorAll('[data-action="logout-all"]').forEach((node) => node.addEventListener('click', logoutAll));
  document.querySelectorAll('[data-action="notifications"]').forEach((node) => node.addEventListener('click', openNotifications));
  document.querySelectorAll('[data-action="notifications-read"]').forEach((node)=>node.addEventListener('click',()=>void markAllNotificationsRead()));
  document.querySelectorAll('[data-notification-page]').forEach((node)=>node.addEventListener('click',()=>{const id=node.dataset.notificationId,page=node.dataset.notificationPage;void markNotificationRead(id).finally(()=>{state.notifications=state.notifications.map(item=>item.id===id?{...item,read:true}:item);state.notificationsOpen=false;if(page)setPage(page);else render();});}));
  document.getElementById('change-password-form')?.addEventListener('submit', submitChangePassword);
  document.getElementById('profile-form')?.addEventListener('submit', saveProfile);
  document.querySelectorAll('[data-action="refresh-account"]').forEach((n)=>n.addEventListener('click',()=>void refreshAccount().then(()=>render())));
  document.querySelectorAll('[data-generate-recovery]').forEach((n)=>n.addEventListener('click',generateRecoveryCode));
  document.querySelectorAll('[data-revoke-session]').forEach((n)=>n.addEventListener('click',()=>revokeSession(n.dataset.revokeSession)));
  document.getElementById('support-form')?.addEventListener('submit', submitSupportTicket);
  document.getElementById('support-form')?.addEventListener('input', (event) => {
    const field = event.target;
    if (!field?.name || !(field.name in state.supportForm)) return;
    state.supportForm[field.name] = String(field.value || '');
  });
  document.querySelectorAll('[data-action="refresh-support"]').forEach((node) => node.addEventListener('click', () => void refreshSupport().then(() => render())));
  document.querySelectorAll('[data-recovery]').forEach((node) => node.addEventListener('click', () => void runRecovery(node.dataset.recovery)));

  document.querySelectorAll('[data-page]').forEach((node) => node.addEventListener('click', () => {
    const page = node.dataset.page;
    if (page === 'buy' && state.page === 'buy') {
      document.getElementById('marketplace-services')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => document.getElementById('service-search')?.focus({ preventScroll: true }), 350);
      return;
    }
    setPage(page);
  }));
  document.querySelectorAll('[data-order-filter]').forEach((node) => node.addEventListener('click', () => {
    state.orderFilter = node.dataset.orderFilter || 'all';
    state.expandedOrderId = null;
    render();
  }));
  document.querySelectorAll('[data-order-toggle]').forEach((node) => node.addEventListener('click', () => {
    state.expandedOrderId = state.expandedOrderId === node.dataset.orderToggle ? null : node.dataset.orderToggle;
    render();
  }));
  document.querySelectorAll('[data-wallet-detail]').forEach((node) => node.addEventListener('click', () => {
    state.expandedWalletTransactionId = state.expandedWalletTransactionId === node.dataset.walletDetail ? null : node.dataset.walletDetail;
    render();
  }));

  bindMarketplaceEvents();
  document.querySelectorAll('[data-cancel]').forEach((node) => node.addEventListener('click', () => {
    state.activeCancelId = node.dataset.cancel;
    renderActiveOnly();
  }));
  document.querySelectorAll('[data-cancel-dismiss]').forEach((node) => node.addEventListener('click', () => {
    state.activeCancelId = null;
    renderActiveOnly();
  }));
  document.querySelectorAll('[data-cancel-confirm]').forEach((node) => node.addEventListener('click', () => void cancelActivation(node.dataset.cancelConfirm)));
  document.querySelectorAll('[data-action="refresh-activation"]').forEach((node) => node.addEventListener('click', () => void refreshSingleActivation(node.dataset.refreshActivation)));
  document.querySelectorAll('[data-copy]').forEach((node) => node.addEventListener('click', async () => {
    const value = node.dataset.copy || '';
    const message = node.dataset.copyMessage || 'Copied';
    try {
      await navigator.clipboard.writeText(value);
      toast(message);
    } catch {
      const field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      try { document.execCommand('copy'); toast(message); }
      catch { toast('Copy unavailable on this browser'); }
      finally { field.remove(); }
    }
  }));
  document.querySelectorAll('[data-action="open-menu"]').forEach((node) => node.addEventListener('click', openMenu));
  document.querySelectorAll('[data-action="close-menu"]').forEach((node) => node.addEventListener('click', closeMenu));
  document.querySelectorAll('[data-action="reset"]').forEach((node) => node.addEventListener('click', resetDemo));
  document.querySelectorAll('[data-action="refresh-customer"]').forEach((node) => node.addEventListener('click', () => {
    if (state.customerDataRefreshing) return;
    state.customerDataRefreshing = true;
    setRefreshUi(true);
    void refreshCurrentCustomerPage().finally(() => {
      state.customerDataRefreshing = false;
      setRefreshUi(false);
      render();
    });
  }));
  document.getElementById('recharge-form')?.addEventListener('submit', submitRecharge);
  document.querySelectorAll('[data-admin-tab]').forEach((node) => node.addEventListener('click', () => loadAdminTab(node.dataset.adminTab)));
  document.getElementById('admin-payment-settings-form')?.addEventListener('submit', (event) => { event.preventDefault(); void adminUpdatePaymentSettings(event.currentTarget); });
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
  document.querySelectorAll('[data-admin-support-filter]').forEach((node) => node.addEventListener('click', () => { state.adminSupportFilter = node.dataset.adminSupportFilter || 'all'; render(); }));
  document.querySelectorAll('[data-admin-support-refresh]').forEach((node) => node.addEventListener('click', () => void loadAdminTab('support')));
  document.querySelectorAll('[data-admin-support-form]').forEach((node) => node.addEventListener('submit', (event) => { event.preventDefault(); adminUpdateSupport(node.dataset.adminSupportForm, node); }));
  document.querySelectorAll('[data-admin-support-assign]').forEach((node) => node.addEventListener('click', () => void adminAssignSupport(node.dataset.adminSupportAssign, state.user?.id)));
  document.querySelectorAll('[data-admin-support-unassign]').forEach((node) => node.addEventListener('click', () => void adminAssignSupport(node.dataset.adminSupportUnassign, null)));
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
    const clearMarketButton = event.target.closest("[data-clear-market]");
    if (clearMarketButton && root.contains(clearMarketButton)) {
      clearMarketplaceFilters();
      return;
    }
    const refreshCatalogButton = event.target.closest("[data-refresh-catalog]");
    if (refreshCatalogButton && root.contains(refreshCatalogButton)) {
      void refreshCatalog({ silent: false });
      return;
    }
    const toggleService = event.target.closest("[data-toggle-service]");
    if (toggleService && root.contains(toggleService)) {
      toggleServiceDetails(toggleService.dataset.toggleService);
      return;
    }
    const category = event.target.closest("[data-category]");
    if (category && root.contains(category)) {
      window.clearTimeout(state.marketSearchTimer);
      state.category = category.dataset.category;
      state.marketVisibleCount = state.search ? MARKET_MAX_SEARCH_RESULTS : MARKET_PAGE_SIZE;
      state.expandedServiceId = null;
      syncMarketplaceUrlState({ replace: false });
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
    const recentBuyButton = event.target.closest("[data-buy-recent-service]");
    if (recentBuyButton && root.contains(recentBuyButton)) {
      openPurchaseReview(recentBuyButton.dataset.buyRecentService);
      return;
    }

    const buyButton = event.target.closest("[data-buy-service]");
    if (buyButton && root.contains(buyButton)) {
      if (buyButton.disabled) return;
      openPurchaseReview(buyButton.dataset.buyService);
      return;
    }

    const purchaseCheckActive = event.target.closest("[data-purchase-check-active]");
    if (purchaseCheckActive && root.contains(purchaseCheckActive)) {
      resetPurchaseFlow();
      setPage('active');
      void loadCustomerData({ silent: true }).then(() => renderActiveOnly());
      return;
    }

    const purchaseRetry = event.target.closest("[data-purchase-retry]");
    if (purchaseRetry && root.contains(purchaseRetry)) {
      void confirmPurchase();
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
      setPage('wallet');
      return;
    }

    const returnPurchase = event.target.closest("[data-return-purchase]");
    if (returnPurchase) {
      const serviceId = state.purchaseFlow.serviceId;
      state.purchaseFlow.returnAfterWallet = false;
      setPage('buy');
      state.expandedServiceId = serviceId;
      renderBuyCatalog();
      scheduleDialogFocus();
    }
  });
}
document.addEventListener('click', (event) => {
  if (!state.notificationsOpen) return;
  const target = event.target;
  if (target instanceof Element && target.closest('.notification-wrap')) return;
  closeNotifications();
});
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
  if (event.key === 'Escape') {
    if (state.notificationsOpen) {
      closeNotifications();
      return;
    }
    if (state.mobileMenu) {
      closeMenu();
      return;
    }
  }
  if (event.key === '/' &&
      !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) &&
      window.matchMedia('(pointer: fine)').matches) {
    event.preventDefault();
    document.getElementById('service-search')?.focus();
  }
});

window.addEventListener('pagehide', () => {
  if (state.user) writeSessionHint(state.user);
});

window.addEventListener('hashchange', handleBrowserNavigation);
window.addEventListener('popstate', handleBrowserNavigation);
window.addEventListener('pageshow', handlePageShow);
document.addEventListener('visibilitychange', handleCustomerVisibilityRefresh);
window.addEventListener('focus', handleCustomerVisibilityRefresh);
window.addEventListener('pageshow', handlePageShow);
window.addEventListener('pagehide', handlePageHide);
window.addEventListener('online', handleConnectivityChange);
window.addEventListener('offline', handleConnectivityChange);
boot();