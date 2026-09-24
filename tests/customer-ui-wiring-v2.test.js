import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) {
  return fs.readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('marketplace categories are derived from the live service catalog', async () => {
  const app = await read('app.js');
  assert.match(app, /catalogCategories/);
  assert.match(app, /Object\.keys\(categoryCounts\)/);
  assert.match(app, /state\.catalogCategories = \['All'/);
  assert.doesNotMatch(app, /const categories = \[/);
});

test('customer service cards expose validity details without provider infrastructure', async () => {
  const app = await read('app.js');
  assert.match(app, /function toggleServiceDetails\(/);
  assert.match(app, /serviceDetailsMarkup\(/);
  assert.match(app, /25 min.*number validity/);
  assert.match(app, /25 minutes.*Maximum number validity/);
  assert.doesNotMatch(app, /Live availability/);
  assert.doesNotMatch(app, /Automatic allocation/);
  assert.doesNotMatch(app, /\/servers/);
});

test('customer bootstrap distinguishes authentication from infrastructure failure', async () => {
  const app = await read('app.js');
  assert.match(app, /async function bootstrapSession\(\)/);
  assert.match(app, /Number\(error\.status\) === 401/);
  assert.match(app, /We could not reach INBOX9/);
  assert.match(app, /INBOX9 is temporarily unavailable/);
  assert.match(app, /data-action="retry-bootstrap"/);
});

test('customer-facing marketplace copy does not expose provider internals', async () => {
  const app = await read('app.js');
  assert.doesNotMatch(app, /NumberOTP · India pool/);
  assert.doesNotMatch(app, /Real provider availability from the public feed/);
  assert.doesNotMatch(app, /Current INBOX9 capacity is synthetic test inventory/);
  assert.doesNotMatch(app, /India \(\+91\)/);
});

test('customer navigation is extracted and remains wired to the application shell', async () => {
  const [app, navigation] = await Promise.all([
    read('app.js'),
    read('customer/navigation.js'),
  ]);
  assert.match(app, /from '\.\/customer\/navigation\.js'/);
  assert.match(app, /createCustomerNavigation\(/);
  assert.match(app, /window\.addEventListener\('hashchange', handleHashNavigation\)/);
  assert.match(app, /window\.addEventListener\('popstate', handleHashNavigation\)/);
  assert.match(navigation, /export const CUSTOMER_PAGES/);
  assert.match(navigation, /function pageFromHash\(/);
  assert.match(navigation, /function syncPageHash\(/);
  assert.match(navigation, /function setPage\(/);
  assert.match(navigation, /function handleHashNavigation\(/);
  assert.match(navigation, /function handleSessionExpired\(/);
});
test('authenticated customer screens have server refresh and session-expiry recovery', async () => {
  const [app, navigation, customerData] = await Promise.all([
    read('app.js'),
    read('customer/navigation.js'),
    read('customer/customer-data.js'),
  ]);
  assert.match(app, /data-action="refresh-customer"/);
  assert.match(navigation, /function handleSessionExpired\(/);
  assert.match(customerData, /Number\(result\.reason\?\.status\) === 401/);
  assert.match(app, /state\.page = 'active';\s+syncPageHash\('active'\)/);
});

test('purchase and cancellation refresh the authoritative customer snapshot', async () => {
  const app = await read('app.js');
  const buyStart = app.indexOf('async function buy(serviceId');
  const buyEnd = app.indexOf('\nasync function cancelActivation', buyStart);
  const buy = app.slice(buyStart, buyEnd);
  assert.match(buy, /await loadCustomerData\(\{ silent: true \}\)/);

  const cancelStart = app.indexOf('async function cancelActivation');
  const cancelEnd = app.indexOf('\nasync function refreshWallet', cancelStart);
  const cancel = app.slice(cancelStart, cancelEnd);
  assert.match(cancel, /await loadCustomerData\(\{ silent: true \}\)/);
});

test('marketplace search keeps a bounded visible result set', async () => {
  const [app, state] = await Promise.all([
    read('app.js'),
    read('customer/state.js'),
  ]);
  assert.match(state, /export const MARKET_PAGE_SIZE = 48/);
  assert.match(state, /export const MARKET_MAX_SEARCH_RESULTS = 96/);
  assert.match(app, /scheduleMarketSearch\(/);
  assert.match(app, /filteredMarketServices\(/);
});

test('customer bundle uses extracted architecture modules', async () => {
  const [app, state, apiClient, ui, navigation, customerData] = await Promise.all([
    read('app.js'),
    read('customer/state.js'),
    read('customer/api-client.js'),
    read('customer/ui.js'),
    read('customer/navigation.js'),
    read('customer/customer-data.js'),
  ]);
  assert.match(app, /from '\.\/customer\/state\.js'/);
  assert.match(app, /from '\.\/customer\/api-client\.js'/);
  assert.match(app, /from '\.\/customer\/ui\.js'/);
  assert.match(app, /from '\.\/customer\/navigation\.js'/);
  assert.match(app, /from '\.\/customer\/customer-data\.js'/);
  assert.match(state, /createCustomerState/);
  assert.match(apiClient, /export async function api/);
  assert.match(ui, /export function normalizeSearchText/);
  assert.match(navigation, /createCustomerNavigation/);
  assert.match(customerData, /createCustomerDataController/);
  assert.match(customerData, /function loadPersisted\(/);
  assert.match(customerData, /function persist\(/);
  assert.match(customerData, /function syncFromServerActivations\(/);
  assert.match(customerData, /async function loadCustomerData\(/);
  assert.match(customerData, /async function refreshCatalog\(/);
  assert.doesNotMatch(app, /const state = \{/);
  assert.doesNotMatch(app, /function normalizeSearchText\(/);
  assert.doesNotMatch(app, /const esc = \(/);
  assert.doesNotMatch(app, /function loadPersisted\(/);
  assert.doesNotMatch(app, /async function loadCustomerData\(/);
  assert.doesNotMatch(app, /async function refreshCatalog\(/);
});


test('customer services no longer attach external availability telemetry', async () => {
  const api = await read('api/_services.js');
  assert.doesNotMatch(api, /getNumberOtpIndiaInventory/);
  assert.doesNotMatch(api, /liveAvailability/);
  assert.doesNotMatch(api, /liveProviders/);
});

test('built-in activation validity defaults to 25 minutes', async () => {
  const [mock, synthetic, repoSource] = await Promise.all([
    read('api/_lib/mock.js'),
    read('api/_lib/synthetic-provider.js'),
    read('api/_lib/activation-repository.js'),
  ]);
  for (const source of [mock, synthetic, repoSource]) assert.match(source, /25 \* 60 \* 1000/);
});


test('browse services scrolls to the marketplace when already on buy page', async () => {
  const app = await read('app.js');
  assert.match(app, /id="marketplace-services"/);
  assert.match(app, /page === 'buy' && state\.page === 'buy'/);
  assert.match(app, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
});

test('hero dashboard uses number validity instead of allocation or code timing', async () => {
  const app = await read('app.js');
  assert.match(app, /<span>Number validity<\/span><strong>25 min<\/strong>/);
  assert.doesNotMatch(app, /<span>Allocation<\/span>/);
  assert.doesNotMatch(app, /<span>Code timing<\/span>/);
  assert.doesNotMatch(app, /server selected at purchase/);
});


test('orders page is a mobile-friendly transaction timeline with authoritative refresh', async () => {
  const app = await read('app.js');
  assert.match(app, /function filteredOrders\(\)/);
  assert.match(app, /function orderCard\(/);
  assert.match(app, /data-order-filter/);
  assert.match(app, /data-order-toggle/);
  assert.match(app, /await loadCustomerData\(\{ silent: true \}\)/);
});

test('wallet page exposes authoritative balance, ledger totals, and pending top-ups', async () => {
  const app = await read('app.js');
  assert.match(app, /function walletSummary\(\)/);
  assert.match(app, /LEDGER CREDITS/);
  assert.match(app, /LEDGER DEBITS/);
  assert.match(app, /PENDING TOP-UPS/);
  assert.match(app, /Authoritative wallet balance/);
});

test('recharge form prevents duplicate submissions while a request is in flight', async () => {
  const [app, state] = await Promise.all([read('app.js'), read('customer/state.js')]);
  assert.match(state, /rechargeSubmitting: false/);
  assert.match(app, /if \(state\.rechargeSubmitting\) return/);
  assert.match(app, /state\.rechargeSubmitting = true/);
  assert.match(app, /Submitting…/);
});


test('wallet summary is authoritative and not limited to the visible ledger slice', async () => {
  const [api, repo, state, data] = await Promise.all([
    read('api/wallet/_index.js'),
    read('api/_lib/wallet-repository.js'),
    read('customer/state.js'),
    read('customer/customer-data.js')
  ]);
  assert.match(api, /getWalletSummary/);
  assert.match(repo, /credit_paise/);
  assert.match(state, /walletSummary/);
  assert.match(data, /state\.walletSummary = wallet\.summary/);
});

test('recharge history explains pending, approved and rejected outcomes', async () => {
  const app = await read('app.js');
  const css = await read('styles.css');
  assert.match(app, /Submitted → Verified → Wallet outcome/);
  assert.match(app, /Payment verified · wallet credited/);
  assert.match(app, /Payment rejected · wallet not credited/);
  assert.match(app, /recharge-reason/);
  assert.match(css, /recharge-status-card/);
  assert.match(css, /recharge-progress/);
});

test('customer notification center surfaces recharge and activation lifecycle events', async () => {
  const [app, state, css] = await Promise.all([read('app.js'), read('customer/state.js'), read('styles.css')]);
  assert.match(state, /notifications: \[\]/);
  assert.match(state, /notificationsOpen: false/);
  assert.match(app, /function notificationSnapshot\(\)/);
  assert.match(app, /Recharge approved/);
  assert.match(app, /Recharge rejected/);
  assert.match(app, /OTP received/);
  assert.match(app, /Number expired/);
  assert.match(app, /notifications-read/);
  assert.match(app, /data-action="notifications"/);
  assert.match(css, /notification-panel/);
  assert.match(css, /notification-badge/);
});

test('notification monitoring refreshes wallet state periodically using the authoritative API', async () => {
  const app = await read('app.js');
  assert.match(app, /lastWalletSignalSync > 15000/);
  assert.match(app, /void refreshWallet\(\)/);
  assert.match(app, /processNotificationSnapshot\(\{ announce: true \}\)/);
  assert.doesNotMatch(app, /state\.balancePaise \+=/);
});
