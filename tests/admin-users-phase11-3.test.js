import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

test('phase 11.3 admin users API supports paginated account directory', async () => {
  const route = await fs.readFile(new URL('../api/admin/_users.js', import.meta.url), 'utf8');
  const repo = await fs.readFile(new URL('../api/_lib/admin-repository.js', import.meta.url), 'utf8');
  const client = await fs.readFile(new URL('../frontend/src/api/admin.ts', import.meta.url), 'utf8');
  const ui = await fs.readFile(new URL('../frontend/src/features/admin/AdminUsers.tsx', import.meta.url), 'utf8');

  assert.match(route, /req\.query\?\.offset/);
  assert.match(repo, /const safeOffset =/);
  assert.match(repo, /LIMIT \$5 OFFSET \$6/);
  assert.match(repo, /hasMore: safeOffset \+ result\.rows\.length < total/);
  assert.match(repo, /MAX\(COALESCE\(s\.last_used_at,s\.created_at\)\)/);
  assert.match(repo, /At least one active admin account must remain enabled/);
  assert.match(client, /offset\?:number/);
  assert.match(client, /pagination:\{limit:number;offset:number;hasMore:boolean\}/);
  assert.match(ui, /const \[offset,setOffset\]=useState\(0\)/);
  assert.match(ui, /limit:pageSize,offset/);
  assert.match(ui, /list\.data\?\.pagination\.hasMore/);
  assert.match(ui, /Last activity/);
});

test('phase 11.3 preserves protected admin account controls', async () => {
  const repo = await fs.readFile(new URL('../api/_lib/admin-repository.js', import.meta.url), 'utf8');
  const route = await fs.readFile(new URL('../api/admin/users/_id.js', import.meta.url), 'utf8');
  const ui = await fs.readFile(new URL('../frontend/src/features/admin/AdminUsers.tsx', import.meta.url), 'utf8');

  assert.match(repo, /if\(row\.id===adminUserId\)throw/);
  assert.match(repo, /if\(!next && row\.role==='admin'\)/);
  assert.match(repo, /UPDATE users SET active=\$2/);
  assert.match(repo, /DELETE FROM sessions WHERE user_id=\$1/);
  assert.match(repo, /user\.sessions_revoked/);
  assert.match(route, /requireAdmin/);
  assert.match(route, /enforceSameOrigin/);
  assert.match(ui, /Disable this account\?/);
  assert.match(ui, /Sign out sessions/);
});
