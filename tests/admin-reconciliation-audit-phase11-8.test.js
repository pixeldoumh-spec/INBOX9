import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return fs.readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('phase 11.8 wallet reconciliation is admin-only, audited and non-mutating', async () => {
  const [route, repo, server, ui, app, shell] = await Promise.all([
    read('api/admin/_wallet-reconciliation.js'),
    read('api/_lib/wallet-reconciliation.js'),
    read('server.js'),
    read('frontend/src/features/admin/AdminReconciliation.tsx'),
    read('frontend/src/app/App.tsx'),
    read('frontend/src/features/admin/AdminShell.tsx')
  ]);
  assert.match(route, /requireAdmin/);
  assert.match(route, /enforceSameOrigin/);
  assert.match(route, /resolveWalletReconciliationIssue/);
  assert.match(repo, /wallet_reconciliation_runs/);
  assert.match(repo, /wallet_reconciliation_issues/);
  assert.match(repo, /wallet.reconciliation_completed/);
  assert.match(repo, /wallet.reconciliation_issue_resolved/);
  assert.doesNotMatch(repo, /UPDATE wallets SET balance_paise/);
  assert.doesNotMatch(repo, /UPDATE wallet_ledger SET/);
  assert.match(server, /adminWalletReconciliation/);
  assert.match(ui, /Run reconciliation/);
  assert.match(ui, /does not change wallet balances/);
  assert.match(app, /AdminReconciliationPage/);
  assert.match(app, /path:'reconciliation'/);
  assert.match(shell, /Reconciliation & audit/);
});

test('phase 11.8 audit API exposes searchable paginated administrative history', async () => {
  const [route, repo] = await Promise.all([
    read('api/admin/_audit.js'),
    read('api/_lib/admin-repository.js')
  ]);
  assert.match(route, /requireAdmin/);
  assert.match(route, /targetType/);
  assert.match(route, /offset/);
  assert.match(repo, /action ILIKE/);
  assert.match(repo, /target_type ILIKE/);
  assert.match(repo, /hasMore/);
  assert.match(repo, /total/);
});
