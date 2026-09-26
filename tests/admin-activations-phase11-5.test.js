import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

test('phase 11.5 activation operations has admin lifecycle monitoring', async () => {
  const listRoute = await fs.readFile(new URL('../api/admin/_activations.js', import.meta.url), 'utf8');
  const detailRoute = await fs.readFile(new URL('../api/admin/activations/_id.js', import.meta.url), 'utf8');
  const repo = await fs.readFile(new URL('../api/_lib/admin-repository.js', import.meta.url), 'utf8');
  const client = await fs.readFile(new URL('../frontend/src/api/admin.ts', import.meta.url), 'utf8');
  const ui = await fs.readFile(new URL('../frontend/src/features/admin/AdminActivations.tsx', import.meta.url), 'utf8');
  const app = await fs.readFile(new URL('../frontend/src/app/App.tsx', import.meta.url), 'utf8');
  const shell = await fs.readFile(new URL('../frontend/src/features/admin/AdminShell.tsx', import.meta.url), 'utf8');
  const server = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(listRoute, /requireAdmin/);
  assert.match(listRoute, /query: req\.query\?\.q/);
  assert.match(listRoute, /status: req\.query\?\.status/);
  assert.match(listRoute, /offset: req\.query\?\.offset/);
  assert.match(repo, /export async function listAdminActivations/);
  assert.match(repo, /cancellationPending/);
  assert.match(repo, /expirationPending/);
  assert.match(repo, /pending_operations/);
  assert.match(repo, /hasMore: safeOffset \+ result\.rows\.length < total/);
  assert.match(detailRoute, /requireAdmin/);
  assert.match(detailRoute, /enforceSameOrigin/);
  assert.match(detailRoute, /activation.admin_cancel_requested/);
  assert.match(detailRoute, /Only an active activation can be cancelled/);
  assert.match(client, /getAdminActivations/);
  assert.match(client, /getAdminActivation/);
  assert.match(client, /cancelAdminActivation/);
  assert.match(ui, /LIFECYCLE OPERATIONS/);
  assert.match(ui, /Cancel & refund/);
  assert.match(ui, /PROVIDER OPERATIONS/);
  assert.match(app, /path:'activations',Component:AdminActivationsPage/);
  assert.match(shell, /\/admin\/activations/);
  assert.match(server, /GET \/api\/admin\/activations/);
  assert.match(server, /adminActivationById/);
});

test('phase 11.5 admin cancellation is not a customer cancellation route', async () => {
  const detailRoute = await fs.readFile(new URL('../api/admin/activations/_id.js', import.meta.url), 'utf8');
  const ui = await fs.readFile(new URL('../frontend/src/features/admin/AdminActivations.tsx', import.meta.url), 'utf8');
  assert.match(detailRoute, /cancelActivation\(id, current\.activation\.userId\)/);
  assert.match(detailRoute, /recordAudit/);
  assert.doesNotMatch(ui, /BottomNav/);
  assert.doesNotMatch(ui, /createActivation/);
});
