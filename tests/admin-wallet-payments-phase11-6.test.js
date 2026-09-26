import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

test('phase 11.6 wallet ledger is read-only, filtered and paginated', async () => {
  const repo = await fs.readFile(new URL('../api/_lib/admin-repository.js', import.meta.url), 'utf8');
  const route = await fs.readFile(new URL('../api/admin/_ledger.js', import.meta.url), 'utf8');
  const client = await fs.readFile(new URL('../frontend/src/api/admin-payments.ts', import.meta.url), 'utf8');
  const ui = await fs.readFile(new URL('../frontend/src/app/App.tsx', import.meta.url), 'utf8');

  assert.match(repo, /export async function listAdminLedger/);
  assert.match(repo, /const safeOffset =/);
  assert.match(repo, /LIMIT \$4 OFFSET \$5/);
  assert.match(repo, /hasMore:safeOffset\+result\.rows\.length<total/);
  assert.match(repo, /entry_type/);
  assert.match(route, /requireAdmin/);
  assert.match(route, /listAdminLedger\(\{query:req\.query\?\.q,type:req\.query\?\.type/);
  assert.match(client, /getAdminLedger/);
  assert.match(client, /pagination/);
  assert.match(ui, /admin-wallet-ledger-panel/);
  assert.match(ui, /Read-only accounting trail/);
  assert.match(ui, /getAdminLedger/);
  assert.doesNotMatch(ui, /UPDATE wallets/);
});

test('phase 11.6 payment review preserves verification and audit safeguards', async () => {
  const walletRepo = await fs.readFile(new URL('../api/_lib/wallet-repository.js', import.meta.url), 'utf8');
  const reviewRoute = await fs.readFile(new URL('../api/admin/recharges/_id.js', import.meta.url), 'utf8');
  const reconRoute = await fs.readFile(new URL('../api/admin/_payment-reconciliation.js', import.meta.url), 'utf8');
  const settingsRoute = await fs.readFile(new URL('../api/admin/_payment-settings.js', import.meta.url), 'utf8');

  assert.match(walletRepo, /Verified payment amount and UTR are required before approval/);
  assert.match(walletRepo, /Verified payment amount does not match the recharge amount/);
  assert.match(walletRepo, /Verified UTR does not match the submitted UTR/);
  assert.match(walletRepo, /recordAuditTx\(client, adminUserId, 'recharge\.approve'/);
  assert.match(walletRepo, /recordAuditTx\(client, adminUserId, 'recharge\.reject'/);
  assert.match(reviewRoute, /requireUser/);
  assert.match(reviewRoute, /user\.role !== 'admin'/);
  assert.match(reviewRoute, /enforceSameOrigin/);
  assert.match(reconRoute, /getPaymentReconciliationSummary/);
  assert.match(reconRoute, /listFlaggedRecharges/);
  assert.match(settingsRoute, /requireAdmin/);
  assert.match(settingsRoute, /enforceSameOrigin/);
});
