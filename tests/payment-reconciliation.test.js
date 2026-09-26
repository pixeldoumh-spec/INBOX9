import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../db/migrations/010_payment_reconciliation.sql', import.meta.url), 'utf8');
const sessionMigration = fs.readFileSync(new URL('../db/migrations/029_recharge_session_linkage.sql', import.meta.url), 'utf8');
const walletRepo = fs.readFileSync(new URL('../api/_lib/wallet-repository.js', import.meta.url), 'utf8');
const adminRoute = fs.readFileSync(new URL('../api/admin/recharges/_id.js', import.meta.url), 'utf8');
const reconciliationRoute = fs.readFileSync(new URL('../api/admin/_payment-reconciliation.js', import.meta.url), 'utf8');

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


test('recharge requests capture the originating session and admin queue exposes payment history context', () => {
  assert.match(sessionMigration, /submission_session_id/);
  assert.match(walletRepo, /createRecharge\(userId, amountPaise, utr, submissionSessionId = null, upiIdOverride = null, customerPaidAt = null\)/);
  assert.match(walletRepo, /submission_session_id\)/);
  assert.match(walletRepo, /recent_payment_history/);
  assert.match(walletRepo, /active_session_count/);
});

test('recharge endpoint binds a database-backed submission to the authenticated session', () => {
  const route = fs.readFileSync(new URL('../api/recharges/_index.js', import.meta.url), 'utf8');
  const auth = fs.readFileSync(new URL('../api/_lib/auth.js', import.meta.url), 'utf8');
  assert.match(route, /getSessionIdForRequest/);
  assert.match(route, /submissionSessionId/);
  assert.match(auth, /export async function getSessionIdForRequest/);
});

test('customer manual recharge flow exposes payment evidence, reference, support and status filters', () => {
  const app = fs.readFileSync(new URL('../frontend/src/app/App.tsx', import.meta.url), 'utf8');
  const customerAccount = fs.readFileSync(new URL('../frontend/src/app/customer-account-pages.tsx', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../frontend/src/api/recharges.ts', import.meta.url), 'utf8');
  assert.match(customerAccount, /customerPaidAt/);
  assert.match(customerAccount, /submittedRechargeId/);
  assert.match(customerAccount, /Recharge submitted/);
  assert.match(customerAccount, /Need help with this recharge/);
  assert.match(customerAccount, /rechargeFilter/);
  assert.match(customerAccount, /Payment completed at/);
  assert.match(api, /createRecharge\(amount:number,utr:string,customerPaidAt\?:string\)/);
});

test('admin manual review flow requires explicit evidence acknowledgement and removes gateway settlement UI', () => {
  const app = fs.readFileSync(new URL('../frontend/src/app/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /I verified the payment record/);
  assert.match(app, /decision==='approve'&&!reviewConfirmed/);
  assert.match(app, /No gateway settlement is used here/);
  assert.match(app, /Pending value/);
  assert.match(app, /Flagged/);
  assert.match(app, /Payment events & flags/);
  assert.doesNotMatch(app, /No webhook events/);
});
