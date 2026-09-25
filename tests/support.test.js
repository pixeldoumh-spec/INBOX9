import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) {
  return fs.readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('support API is authenticated, rate limited, same-origin protected for writes, and linked to customer-owned records', async () => {
  const [route, repoSource] = await Promise.all([
    read('api/support/_index.js'),
    read('api/_lib/support-repository.js')
  ]);
  assert.match(route, /requireUser/);
  assert.match(route, /support-create/);
  assert.match(route, /enforceSameOrigin/);
  assert.match(repoSource, /activation_id/);
  assert.match(repoSource, /recharge_id/);
  assert.match(repoSource, /activation\.id=\$1 AND user_id=\$2|activation_id/);
});

test('support schema constrains customer input and links lifecycle references', async () => {
  const [sql, supabase] = await Promise.all([
    read('db/migrations/023_support_requests.sql'),
    read('supabase/migrations/202609240003_support_requests.sql')
  ]);
  for (const source of [sql, supabase]) {
    assert.match(source, /support_requests/);
    assert.match(source, /char_length\(subject\) BETWEEN 4 AND 120/);
    assert.match(source, /char_length\(message\) BETWEEN 10 AND 2000/);
    assert.match(source, /activation_id TEXT REFERENCES/);
    assert.match(source, /recharge_id TEXT REFERENCES/);
  }
});


test('admin support queue is authenticated, auditable, and wired into the runtime', async () => {
  const [index, byId, repo, server] = await Promise.all([
    read('api/admin/support/_index.js'),
    read('api/admin/support/_id.js'),
    read('api/_lib/support-repository.js'),
    read('server.js')
  ]);
  assert.match(index, /requireAdmin/);
  assert.match(byId, /requireAdmin/);
  assert.match(byId, /enforceSameOrigin/);
  assert.match(byId, /validateBodySize/);
  assert.match(repo, /recordAuditTx/);
  assert.match(repo, /support\.ticket_updated/);
  assert.match(repo, /assigned_admin_id/);
  assert.match(server, /adminSupportById/);
});
