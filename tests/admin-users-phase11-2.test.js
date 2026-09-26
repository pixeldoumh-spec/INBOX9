import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';

test('Phase 11.2 admin user operations are isolated, searchable and auditable', async()=>{
  const route=await fs.readFile(new URL('../api/admin/_users.js',import.meta.url),'utf8');
  const repository=await fs.readFile(new URL('../api/_lib/admin-repository.js',import.meta.url),'utf8');
  const ui=await fs.readFile(new URL('../frontend/src/features/admin/AdminUsers.tsx',import.meta.url),'utf8');
  assert.match(route,/requireAdmin/); assert.match(route,/enforceSameOrigin/); assert.match(route,/logout_all/);
  assert.match(repository,/user.disabled/); assert.match(repository,/user.enabled/); assert.match(repository,/user.sessions_revoked/);
  assert.match(repository,/DELETE FROM sessions WHERE user_id=\$1/);
  assert.match(ui,/Search email, name or user ID/); assert.match(ui,/Disable account/); assert.match(ui,/Sign out sessions/);
});

test('Phase 11.2 keeps the admin users route under the isolated shell', async()=>{
  const source=await fs.readFile(new URL('../frontend/src/app/App.tsx',import.meta.url),'utf8');
  assert.match(source,/path:'\/admin',Component:AdminAccessGate/); assert.match(source,/path:'users',children/); assert.doesNotMatch(source,/path:'admin\/users'/);
});
