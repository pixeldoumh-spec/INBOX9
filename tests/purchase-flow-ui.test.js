import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('purchase flow is a three-step customer-facing state machine', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /purchaseFlow:\s*\{/);
  assert.match(app, /step:\s*'service'/);
  assert.match(app, /step:\s*'review'/);
  assert.match(app, /step:\s*'activation'/);
  assert.match(app, /function openPurchaseReview\(/);
  assert.match(app, /async function confirmPurchase\(/);
  assert.match(app, /data-purchase-confirm/);
  assert.match(app, /data-purchase-close/);
  assert.match(app, /data-purchase-wallet/);
});

test('confirmation shows the key customer decision data', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /Current balance/);
  assert.match(app, /After purchase/);
  assert.match(app, /OTP in about 20 seconds/);
  assert.match(app, /Your number appears immediately/);
  assert.match(app, /Confirm &amp; Get Number/);
});

test('marketplace server controls no longer expose synthetic implementation language', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /<strong>Choose a server<\/strong>/);
  assert.match(app, /Availability updates automatically/);
  assert.doesNotMatch(app, /11 synthetic servers · 5,000 total slots/);
  assert.doesNotMatch(app, /Live synthetic server pools/);
});