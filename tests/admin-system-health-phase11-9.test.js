import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return fs.readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('phase 11.9 aggregated system health is admin-only and exposes actionable operational signals', async () => {
  const [route, client, ui, app, shell, server, observability, health] = await Promise.all([
    read('api/admin/_system-health.js'),
    read('frontend/src/api/admin-system-health.ts'),
    read('frontend/src/features/admin/AdminSystemHealth.tsx'),
    read('frontend/src/app/App.tsx'),
    read('frontend/src/features/admin/AdminShell.tsx'),
    read('server.js'),
    read('api/_lib/observability.js'),
    read('api/_health.js')
  ]);
  assert.match(route, /requireAdmin/);
  assert.match(route, /providerHealth/);
  assert.match(route, /getProviderOperationsMonitor/);
  assert.match(route, /getLatestWalletReconciliation/);
  assert.match(route, /activeServicesWithoutUsableRoute/);
  assert.match(route, /productionConfiguration/);
  assert.match(route, /observabilitySnapshot/);
  assert.match(client, /\/api\/admin\/system-health/);
  assert.match(ui, /System health/);
  assert.match(ui, /HTTP 5xx/);
  assert.match(ui, /Browser errors/);
  assert.match(ui, /Top routes/);
  assert.match(app, /AdminSystemHealthPage/);
  assert.match(app, /path:'health'/);
  assert.match(shell, /System health/);
  assert.match(server, /adminSystemHealth/);
  assert.match(server, /GET \/api\/admin\/system-health/);
  assert.match(observability, /clientErrors/);
  assert.match(observability, /slowRequests/);
  assert.match(health, /databaseReachable/);
});

test('phase 11.9 health endpoint does not expose secret values', async () => {
  const route = await read('api/admin/_system-health.js');
  assert.doesNotMatch(route, /DATABASE_URL/);
  assert.doesNotMatch(route, /CRON_SECRET/);
  assert.doesNotMatch(route, /SENTRY_DSN/);
});
