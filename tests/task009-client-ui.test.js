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
    'availability-pill', 'server-panel-head', 'service-price'
  ]) {
    assert.equal((app + css).includes(token), true, token);
  }
});

test('advanced UI layer includes mobile and reduced-motion safeguards', async () => {
  const css = await read('styles.css');
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /backdrop-filter:blur/);
  assert.match(css, /content-visibility:auto/);
});

test('marketplace hero exposes live state instead of hard-coded totals', async () => {
  const app = await read('app.js');
  assert.match(app, /const activeCount = state\.active\.length;/);
  assert.match(app, /const serviceCount = state\.services\.length;/);
  assert.match(app, /state\.services\.length\.toLocaleString\(\)/);
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
