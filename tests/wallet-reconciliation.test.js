import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../db/migrations/009_wallet_reconciliation.sql', import.meta.url), 'utf8');
const reconciliation = fs.readFileSync(new URL('../api/_lib/wallet-reconciliation.js', import.meta.url), 'utf8');

function ledgerBalance(entries) {
  return entries.reduce((sum, entry) => sum + (entry.type === 'credit' ? entry.amount : -entry.amount), 0);
}

test('wallet ledger arithmetic reconciles credits minus debits', () => {
  assert.equal(ledgerBalance([
    { type: 'credit', amount: 50000 },
    { type: 'debit', amount: 950 },
    { type: 'credit', amount: 1200 },
  ]), 50250);
});

test('migration installs a deferred wallet ledger invariant trigger', () => {
  assert.match(migration, /CREATE CONSTRAINT TRIGGER wallet_balance_ledger_invariant/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /wallet ledger invariant violated/);
});

test('reconciliation records mismatch snapshots and exposes latest/open issue queries', () => {
  assert.match(reconciliation, /wallet_reconciliation_runs/);
  assert.match(reconciliation, /wallet_reconciliation_issues/);
  assert.match(reconciliation, /recorded_balance_paise/);
  assert.match(reconciliation, /ledger_balance_paise/);
  assert.match(reconciliation, /mismatchesFound/);
  assert.match(reconciliation, /resolved_at IS NULL/);
});
