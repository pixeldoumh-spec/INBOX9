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

test('service capacity is wired to the authenticated backend endpoint', async () => {
  const app = await read('app.js');
  assert.match(app, /async function toggleServiceCapacity\(/);
  assert.match(app, /\/api\/services\//);
  assert.match(app, /encodeURIComponent\(serviceId\)/);
  assert.match(app, /\/servers/);
  assert.match(app, /data-toggle-service=/);
  assert.match(app, /serverStatsMarkup\(/);
  assert.match(app, /Automatic allocation/);
  assert.doesNotMatch(app, /NumberOTP ·/);
  assert.doesNotMatch(app, /synthetic servers/);
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
  const [app, navigation] = await Promise.all([
    read('app.js'),
    read('customer/navigation.js'),
  ]);
  assert.match(app, /data-action="refresh-customer"/);
  assert.match(navigation, /function handleSessionExpired\(/);
  assert.match(app, /Number\(result\.reason\?\.status\) === 401/);
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
  const [app, state, apiClient, ui] = await Promise.all([
    read('app.js'),
    read('customer/state.js'),
    read('customer/api-client.js'),
    read('customer/ui.js'),
  ]);
  assert.match(app, /from '\.\/customer\/state\.js'/);
  assert.match(app, /from '\.\/customer\/api-client\.js'/);
  assert.match(app, /from '\.\/customer\/ui\.js'/);
  assert.match(state, /createCustomerState/);
  assert.match(apiClient, /export async function api/);
  assert.match(ui, /export function normalizeSearchText/);
  assert.doesNotMatch(app, /const state = \{/);
  assert.doesNotMatch(app, /function normalizeSearchText\(/);
  assert.doesNotMatch(app, /const esc = \(/);
});
