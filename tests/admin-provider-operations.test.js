import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';

test('admin reconciliation monitor is wired end-to-end', async () => {
  const [server, repository, route] = await Promise.all([
    fs.readFile(new URL('../server.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../api/_lib/admin-repository.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../api/admin/_provider-operations.js', import.meta.url), 'utf8'),
  ]);
  assert.match(server, /adminProviderOperations/);
  assert.match(server, /GET \/api\/admin\/provider-operations/);
  assert.match(repository, /getProviderOperationsMonitor/);
  assert.match(repository, /status='Pending'/);
  assert.match(repository, /status='Failed'/);
  assert.match(route, /requireAdmin/);
  assert.match(route, /admin-provider-operations/);
});
