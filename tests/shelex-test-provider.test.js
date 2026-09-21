import test from 'node:test';
import assert from 'node:assert/strict';
import { shelexTestProvider } from '../api/_lib/shelex-test-provider.js';

test('Shelex test provider is diagnostic-only and refuses paid activation reservation', async () => {
  await assert.rejects(
    () => shelexTestProvider.reserveNumber({ id: 'svc-test', name: 'Test' }),
    error => error?.code === 'PROVIDER_UNSUPPORTED'
  );
});

test('Shelex test provider refuses activation polling', async () => {
  await assert.rejects(
    () => shelexTestProvider.getActivation({}),
    error => error?.code === 'PROVIDER_UNSUPPORTED'
  );
});

test('Shelex test provider refuses cancellation', async () => {
  await assert.rejects(
    () => shelexTestProvider.cancelActivation({}),
    error => error?.code === 'PROVIDER_UNSUPPORTED'
  );
});

test('Shelex adapter is registered in provider registry', async () => {
  const { getProviderAdapter, listProviderAdapters } = await import('../api/_lib/provider-registry.js');
  assert.ok(listProviderAdapters().includes('shelex-test'));
  assert.equal(getProviderAdapter('shelex-test'), shelexTestProvider);
});

test('Shelex production seed migration keeps the diagnostic provider inactive', async () => {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile(new URL('../db/migrations/013_shelex_test_provider.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes("'provider-shelex-test'"));
  assert.ok(sql.includes("'shelex-test',FALSE"));
  assert.ok(sql.includes("'013_shelex_test_provider'"));
});
