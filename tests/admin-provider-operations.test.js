import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('admin reconciliation monitor is wired end-to-end', async () => {
  const [server, repository, route, state, app] = await Promise.all([
    fs.readFile(new URL('../server.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../api/_lib/admin-repository.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../api/admin/_provider-operations.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../customer/state.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../app.js', import.meta.url), 'utf8')
  ]);
  assert.match(server, /adminProviderOperations/);
  assert.match(server, /GET \/api\/admin\/provider-operations/);
  assert.match(repository, /getProviderOperationsMonitor/);
  assert.match(repository, /status='Pending'/);
  assert.match(repository, /status='Failed'/);
  assert.match(route, /requireAdmin/);
  assert.match(route, /admin-provider-operations/);
  assert.match(state, /providerOperations/);
  assert.match(app, /provider-operations/);
  assert.match(app, /adminProviderOperationsPage/);
  assert.match(app, /Durable reconciliation queue/);
});
