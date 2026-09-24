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
  assert.match(app, /function receivedCodeCard\(/);
  assert.match(app, /Last 15 minutes/);
  assert.match(app, /VERIFICATION CODE/);
  assert.match(app, /data-copy-message="OTP copied"/);
  assert.match(app, /data-copy-message="Number copied"/);
  assert.match(customerData, /state\.recentActivations = ordered/);
  assert.match(app, /state\.recentActivations = \[latest/);
  assert.doesNotMatch(app, /state\.balancePaise \+= Number\(item\.pricePaise/);
  assert.match(css, /recent-activation-card/);
  assert.match(css, /received-code-card/);
  assert.match(css, /active-action-error/);
  assert.match(css, /cancel-confirm/);
});

test('active lifecycle keeps timing internal and shows plain waiting states', async () => {
  const app = await read('app.js');
  assert.match(app, /const expiresAt = Number\(activation\.expiresAt/);
  assert.match(app, /const createdAt = Number\(activation\.createdAt/);
  assert.match(app, /Waiting for number/);
  assert.match(app, /Waiting for OTP/);
  assert.doesNotMatch(app, /numberFetchClock/);
  assert.doesNotMatch(app, /otpClock/);
  assert.doesNotMatch(app, /const total = Math\.max\(1, expiresAt - createdAt/);
});

test('active workspace renders OTP and status-specific lifecycle states', async () => {
  const app = await read('app.js');
  assert.match(app, /const otp = String\(activation\.otp \|\| ''\)\.trim\(\)/);
  assert.match(app, /Code received/);
  assert.match(app, /Cancellation in progress/);
  assert.match(app, /Expiring/);
  assert.match(app, /otp-received-panel/);
  assert.match(app, /Copy code/);
});

test('active cancellation uses the authoritative API and confirmation step', async () => {
  const app = await read('app.js');
  assert.match(app, /\/api\/activations\/.*\/cancel/);
  assert.match(app, /data-cancel-confirm/);
  assert.match(app, /request a refund/);
  assert.doesNotMatch(app, /engine === 'synthetic-local'/);
});

test('active workspace exposes explicit recovery for activation sync failures', async () => {
  const app = await read('app.js');
  assert.match(app, /data-action="refresh-activation"/);
  assert.match(app, /function refreshSingleActivation\(/);
  assert.match(app, /activeActionErrorById/);
  assert.match(app, /Check status/);
});

test('customer visibility and focus trigger a throttled authoritative refresh', async () => {
  const app = await read('app.js');
  assert.match(app, /function handleCustomerVisibilityRefresh\(/);
  assert.match(app, /document\.addEventListener\('visibilitychange', handleCustomerVisibilityRefresh\)/);
  assert.match(app, /window\.addEventListener\('focus', handleCustomerVisibilityRefresh\)/);
  assert.match(app, /lastForegroundRefreshAt/);
});

test('copy controls support contextual messages and a browser fallback', async () => {
  const app = await read('app.js');
  assert.match(app, /dataset\.copyMessage/);
  assert.match(app, /document\.execCommand\('copy'\)/);
});
