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

test('customer navigation survives refresh and supports browser history', async () => {
  const app = await read('app.js');
  assert.match(app, /function pageFromHash\(/);
  assert.match(app, /function syncPageHash\(/);
  assert.match(app, /window\.addEventListener\('hashchange', handleHashNavigation\)/);
  assert.match(app, /window\.addEventListener\('popstate', handleHashNavigation\)/);
});

test('authenticated customer screens have server refresh and session-expiry recovery', async () => {
  const app = await read('app.js');
  assert.match(app, /data-action="refresh-customer"/);
  assert.match(app, /function handleSessionExpired\(/);
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
  const app = await read('app.js');
  assert.match(app, /MARKET_PAGE_SIZE = 48/);
  assert.match(app, /MARKET_MAX_SEARCH_RESULTS = 96/);
  assert.match(app, /scheduleMarketSearch\(/);
  assert.match(app, /filteredMarketServices\(/);
});
