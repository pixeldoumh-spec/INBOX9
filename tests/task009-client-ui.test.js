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
  assert.match(css, /@media\\(max-width:620px\\)/);
  assert.match(css, /@media\\(prefers-reduced-motion:reduce\\)/);
  assert.match(css, /backdrop-filter:blur/);
  assert.match(css, /content-visibility:auto/);
});

test('marketplace hero exposes live state instead of hard-coded totals', async () => {
  const app = await read('app.js');
  assert.match(app, /const activeCount = state\\.active\\.length;/);
  assert.match(app, /const serviceCount = state\\.services\\.length;/);
  assert.match(app, /state\\.services\\.length\\.toLocaleString\\(\\)/);
});
