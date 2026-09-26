import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';

test('phase 11.3 service catalog is admin-only and searchable', async () => {
  const route = await fs.readFile(new URL('../api/admin/_services.js', import.meta.url), 'utf8');
  const detailRoute = await fs.readFile(new URL('../api/admin/services/_id.js', import.meta.url), 'utf8');
  const repository = await fs.readFile(new URL('../api/_lib/admin-repository.js', import.meta.url), 'utf8');
  const server = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');
  const ui = await fs.readFile(new URL('../frontend/src/features/admin/AdminServices.tsx', import.meta.url), 'utf8');
  const client = await fs.readFile(new URL('../frontend/src/api/admin.ts', import.meta.url), 'utf8');
  const app = await fs.readFile(new URL('../frontend/src/app/App.tsx', import.meta.url), 'utf8');
  const shell = await fs.readFile(new URL('../frontend/src/features/admin/AdminShell.tsx', import.meta.url), 'utf8');

  assert.match(route, /requireAdmin/);
  assert.match(route, /req\.query\?\.q/);
  assert.match(route, /req\.query\?\.status/);
  assert.match(route, /req\.query\?\.offset/);
  assert.match(detailRoute, /requireAdmin/);
  assert.match(detailRoute, /enforceSameOrigin/);
  assert.match(detailRoute, /updateService/);
  assert.match(repository, /service\.routing_updated/);
  assert.match(repository, /validateAndNormalizeRoutes/);
  assert.match(repository, /An active service must have at least one active route to an active provider/);
  assert.match(repository, /UPDATE service_provider_routes SET active=FALSE/);
  assert.match(repository, /ON CONFLICT \(service_id,provider_id\)/);
  assert.match(server, /GET \/api\/admin\/services/);
  assert.match(server, /PATCH \/api\/admin\/services\/\:id/);
  assert.match(ui, /Provider routes/);
  assert.match(ui, /Visible to customers/);
  assert.match(ui, /Add route/);
  assert.match(client, /getAdminServices/);
  assert.match(client, /updateAdminService/);
  assert.match(app, /path:'services',Component:AdminServicesPage/);
  assert.match(shell, /\/admin\/services/);
});

test('phase 11.3 does not mount customer Buy UI inside admin services page', async () => {
  const ui = await fs.readFile(new URL('../frontend/src/features/admin/AdminServices.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /createActivation/);
  assert.doesNotMatch(ui, /\/buy\?serviceId/);
  assert.doesNotMatch(ui, /BottomNav/);
  assert.doesNotMatch(ui, /wallet/);
});
