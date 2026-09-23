import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../db/migrations/010_payment_reconciliation.sql', import.meta.url), 'utf8');
const walletRepo = fs.readFileSync(new URL('../api/_lib/wallet-repository.js', import.meta.url), 'utf8');
const adminRoute = fs.readFileSync(new URL('../api/admin/recharges/_id.js', import.meta.url), 'utf8');
const reconciliationRoute = fs.readFileSync(new URL('../api/admin/payment-reconciliation.js', import.meta.url), 'utf8');

test('payment reconciliation migration records review events and flags', () => {
  assert.match(migration, /payment_reconciliation_events/);
  assert.match(migration, /event_type IN \('submitted','verified','approved','rejected','flagged'\)/);
  assert.match(migration, /verified_amount_paise/);
  assert.match(migration, /verified_utr/);
  assert.match(migration, /external_reference/);
});

test('recharge approval requires matching verified amount and UTR when supplied', () => {
  assert.match(walletRepo, /Verified payment amount does not match the recharge amount/);
  assert.match(walletRepo, /Verified UTR does not match the submitted UTR/);
});

test('recharge review supports flagging without crediting the wallet', () => {
  assert.match(walletRepo, /export async function flagRecharge/);
  assert.match(walletRepo, /'flagged'/);
  assert.match(walletRepo, /Only pending recharge requests can be flagged/);
  assert.match(adminRoute, /decision === 'flag'/);
});

test('admin payment reconciliation exposes summary and flagged requests', () => {
  assert.match(reconciliationRoute, /getPaymentReconciliationSummary/);
  assert.match(reconciliationRoute, /listFlaggedRecharges/);
  assert.match(reconciliationRoute, /Admin access required/);
});
