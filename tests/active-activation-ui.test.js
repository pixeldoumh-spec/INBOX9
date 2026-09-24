import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) {
  return fs.readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('active activation keeps completed OTP accessible in a recent section', async () => {
  const [app, state, customerData, css] = await Promise.all([
    read('app.js'),
    read('customer/state.js'),
    read('customer/customer-data.js'),
    read('styles.css'),
  ]);
  assert.match(state, /recentActivations: \[\]/);
  assert.match(state, /activeCancelId: null/);
  assert.match(state, /activeCancelBusy: new Set/);
  assert.match(app, /function recentActivationCard\(/);
  assert.match(app, /Last 15 minutes/);
  assert.match(app, /data-copy-message="OTP copied"/);
  assert.match(app, /data-copy-message="Number copied"/);
  assert.match(customerData, /state\.recentActivations = ordered/);
  assert.match(app, /state\.recentActivations = \[latest/);
  assert.doesNotMatch(app, /state\.balancePaise \+= Number\(item\.pricePaise/);
  assert.match(css, /recent-activation-card/);
  assert.match(css, /cancel-confirm/);
});

test('active countdown derives total duration from activation timestamps', async () => {
  const app = await read('app.js');
  assert.match(app, /const expiresAt = Number\(activation\.expiresAt/);
  assert.match(app, /const createdAt = Number\(activation\.createdAt/);
  assert.match(app, /const total = Math\.max\(1, expiresAt - createdAt \|\| \(25 \* 60 \* 1000\)\)/);
});

test('active cancellation uses the authoritative API and confirmation step', async () => {
  const app = await read('app.js');
  assert.match(app, /\/api\/activations\/.*\/cancel/);
  assert.match(app, /data-cancel-confirm/);
  assert.match(app, /server-side refund/);
  assert.doesNotMatch(app, /engine === 'synthetic-local'/);
});

test('copy controls support contextual messages and a browser fallback', async () => {
  const app = await read('app.js');
  assert.match(app, /dataset\.copyMessage/);
  assert.match(app, /document\.execCommand\('copy'\)/);
});
