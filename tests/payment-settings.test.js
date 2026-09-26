import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizePaymentSettings } from '../api/_lib/payment-settings.js';

test('payment settings normalize valid merchant destination', () => {
  const value = normalizePaymentSettings({
    upiId: 'merchant@upi',
    merchantName: 'INBOX9 Payments',
    instructions: 'Pay the exact amount.',
    qrImage: 'https://example.com/qr.png'
  });
  assert.equal(value.upiId, 'merchant@upi');
  assert.equal(value.merchantName, 'INBOX9 Payments');
  assert.equal(value.qrImage, 'https://example.com/qr.png');
  assert.equal(value.enabled, null);
  assert.equal(normalizePaymentSettings({ upiId: 'merchant@upi', enabled: true }).enabled, true);
  assert.equal(normalizePaymentSettings({ upiId: 'merchant@upi', enabled: false }).enabled, false);
  assert.equal(value.enabled, null);
});

test('payment settings accept bounded QR data URLs', () => {
  const value = normalizePaymentSettings({
    upiId: 'merchant@upi',
    qrImage: 'data:image/png;base64,QUJDRA=='
  });
  assert.match(value.qrImage, /^data:image\/png;base64,/);
});

test('payment settings reject invalid merchant and QR values', () => {
  assert.throws(() => normalizePaymentSettings({ upiId: 'not-a-upi' }), /valid merchant UPI ID/);
  assert.throws(() => normalizePaymentSettings({ upiId: 'merchant@upi', qrImage: 'javascript:alert(1)' }), /QR must be an HTTPS image URL/);
});

test('payment endpoints are wired through the runtime', () => {
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const wallet = fs.readFileSync(new URL('../api/wallet/_index.js', import.meta.url), 'utf8');
  const recharge = fs.readFileSync(new URL('../api/recharges/_index.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../db/migrations/038_manual_payment_operations.sql', import.meta.url), 'utf8');
  assert.match(server, /GET \/api\/admin\/payment-settings/);
  assert.match(server, /PATCH \/api\/admin\/payment-settings/);
  assert.match(wallet, /getPaymentSettings/);
  assert.match(wallet, /paymentSettings\.enabled/);
  assert.match(migration, /038_manual_payment_operations/);
  assert.match(recharge, /paymentSettings\.upiId/);
  assert.match(wallet, /paymentSettings\.enabled/);
});
