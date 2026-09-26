import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

const journal = await fs.readFile(new URL('../api/_lib/provider-reconciliation-journal.js', import.meta.url), 'utf8');
const internal = await fs.readFile(new URL('../api/_internal-provider-reconcile.js', import.meta.url), 'utf8');
const route = await fs.readFile(new URL('../api/admin/_provider-operations.js', import.meta.url), 'utf8');
const migration = await fs.readFile(new URL('../db/migrations/043_provider_reconciliation_journal.sql', import.meta.url), 'utf8');
const supabaseMigration = await fs.readFile(new URL('../supabase/migrations/20260926162000_provider_reconciliation_journal.sql', import.meta.url), 'utf8');

test('Phase 6 creates durable reconciliation run and event journals', () => {
  assert.match(migration, /provider_reconciliation_runs/);
  assert.match(migration, /provider_reconciliation_events/);
  assert.match(migration, /schema_migrations/);
  assert.match(supabaseMigration, /provider_reconciliation_runs/);
  assert.match(supabaseMigration, /schema_migrations/);
  assert.match(journal, /beginProviderReconciliationRun/);
  assert.match(journal, /recordProviderReconciliationEvent/);
  assert.match(journal, /finishProviderReconciliationRun/);
});

test('reconciliation detects provider allocation orphans and records manual review', () => {
  assert.match(journal, /findProviderReconciliationOrphans/);
  assert.match(journal, /a\.provider_activation_id IS NOT NULL/);
  assert.match(internal, /action: 'orphan_review'/);
  assert.match(internal, /outcome: 'needs_review'/);
});

test('reconciliation remains authenticated and does not expose a public trigger', () => {
  assert.match(internal, /verifyGithubOidcToken/);
  assert.match(internal, /validSharedSecret/);
  assert.match(internal, /401/);
});

test('admin provider operations exposes reconciliation monitor only behind admin auth', () => {
  assert.match(route, /getProviderReconciliationMonitor/);
  assert.match(route, /view.*reconciliation/);
  assert.match(route, /requireAdmin/);
});
