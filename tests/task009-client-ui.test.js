import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) {
  return fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('premium marketplace UI hooks are present', async () => {
  const app = await read('app.js');
  const css = await read('styles.css');
  for (const token of [
    'premium-hero', 'hero-dashboard', 'hero-stat-grid', 'hero-live',
    'premium-search', 'market-results-bar', 'service-group-meta',
    'wallet-ready-chip', 'market-recent', 'service-price'
  ]) {
    assert.equal((app + css).includes(token), true, token);
  }
});

test('advanced UI layer includes mobile and reduced-motion safeguards', async () => {
  const css = await read('styles.css');
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /backdrop-filter:blur/);
  assert.doesNotMatch(css, /content-visibility:auto/);
  assert.match(css, /\.customer-service-grid\{align-content:start\}/);
  assert.match(css, /\.account-grid\{align-items:start\}/);
  assert.match(css, /\.refresh-btn:disabled\{opacity:.65;cursor:wait\}/);
});

test('marketplace hero exposes customer-safe state instead of provider connectivity claims', async () => {
  const app = await read('app.js');
  assert.match(app, /const activeCount = state\.active\.length;/);
  assert.match(app, /const serviceCount = state\.services\.length;/);
  assert.match(app, /state\.services\.length\.toLocaleString\(\)/);
  assert.match(app, /Account ready/);
  assert.doesNotMatch(app, /Backend connected/);
  assert.doesNotMatch(app, /LIVE API/);
});


test('customer marketplace exposes resilient catalog loading and freshness states', async () => {
  const [app, state, customerData, css] = await Promise.all([
    read('app.js'),
    read('customer/state.js'),
    read('customer/customer-data.js'),
    read('styles.css'),
  ]);
  assert.match(state, /catalogLoading: false/);
  assert.match(state, /catalogError: ''/);
  assert.match(customerData, /state\.catalogLoading = true/);
  assert.match(customerData, /state\.catalogError/);
  assert.match(app, /catalogFreshnessText\(\)/);
  assert.match(app, /catalogLoadingMarkup\(\)/);
  assert.match(app, /data-refresh-catalog/);
  assert.match(app, /Refreshing live catalog/);
  assert.match(css, /catalog-skeleton-card/);
  assert.match(css, /skeleton-shimmer/);
});


test('marketplace search and category filters persist in the URL and recover on navigation', async () => {
  const [app, state, css] = await Promise.all([
    read('app.js'),
    read('customer/state.js'),
    read('styles.css'),
  ]);
  assert.match(app, /readMarketplaceUrlState\(\)/);
  assert.match(app, /syncMarketplaceUrlState\(\{ replace: true \}\)/);
  assert.equal(app.includes('syncMarketplaceUrlState({ replace: false });'), true);
  assert.match(app, /handleMarketplaceUrlNavigation\(\)/);
  assert.match(app, /data-clear-market/);
  assert.match(state, /marketUrlSyncTimer: null/);
  assert.match(css, /market-filter-state/);
  assert.match(css, /scroll-snap-type:x proximity/);
});

test('marketplace URL state does not pollute the page hash or unrelated query parameters', async () => {
  const app = await read('app.js');
  assert.match(app, /const next = url\.pathname \+ \(url\.searchParams\.toString\(\) \? `\?\${url\.searchParams\.toString\(\)\}` : ''\) \+ url\.hash/);
  assert.match(app, /window\.location\.hash/);
});


test('customer refresh controls expose a page-aware sync state', async () => {
  const app = await read('app.js');
  assert.match(app, /data-global-sync/);
  assert.match(app, /Reconnecting/);
  assert.match(app, /Syncing/);
  assert.match(app, /async function refreshCurrentCustomerPage\(\)/);
  assert.match(app, /if \(page === 'wallet'\)/);
  assert.match(app, /if \(page === 'support'\)/);
  assert.match(app, /if \(page === 'account'\)/);
  assert.match(app, /if \(page === 'admin'\)/);
});
