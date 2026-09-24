import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('purchase flow is a three-step customer-facing state machine', async () => {
  const [app, state] = await Promise.all([
    fs.readFile(new URL('../app.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../customer/state.js', import.meta.url), 'utf8'),
  ]);
  assert.match(state, /purchaseFlow:\s*\{/);
  assert.match(state, /step:\s*'service'/);
  assert.match(app, /step:\s*'review'/);
  assert.match(app, /step:\s*'activation'|purchaseFlow\.step\s*=\s*'activation'/);
  assert.match(app, /function openPurchaseReview\(/);
  assert.match(app, /async function confirmPurchase\(/);
  assert.match(app, /data-purchase-confirm/);
  assert.match(app, /data-purchase-close/);
  assert.match(app, /data-purchase-wallet/);
});

test('confirmation shows the key customer decision data', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /\+91/);
  assert.match(app, /Price/);
  assert.match(app, /Number validity/);
  assert.match(app, /OTP delivery timing varies by service/);
  assert.match(app, /Activation tracking/);
  assert.doesNotMatch(app, /Availability/);
  assert.doesNotMatch(app, /OTP appears in about 20 seconds/);
  assert.match(app, /Get number/);
});

test('customer marketplace no longer exposes server or slot controls', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /data-buy-service/);
  assert.doesNotMatch(app, /Automatic allocation/);
  assert.doesNotMatch(app, /data-buy-server-service/);
  assert.doesNotMatch(app, /<strong>Choose a server<\/strong>/);
  assert.doesNotMatch(app, /SERVER SELECTION/);
});


test('service cards explain affordability before purchase', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /Wallet ready/);
  assert.match(app, /balanceDelta/);
  assert.match(app, /wallet-ready-chip/);
});

test('purchase review shows wallet balance and projected remaining balance', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /Wallet balance/);
  assert.match(app, /After purchase/);
  assert.match(app, /data\.afterBalancePaise/);
});


test('customer purchase copy uses 25 minute validity and no removed availability copy', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /25 minutes/);
  assert.doesNotMatch(app, /3 minutes/);
  assert.doesNotMatch(app, /Automatic allocation/);
  assert.doesNotMatch(app, /Live availability/);
});
