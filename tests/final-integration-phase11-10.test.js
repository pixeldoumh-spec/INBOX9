import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return fs.readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('phase 11.10 final integration keeps customer and admin route trees isolated', async () => {
  const [app, shell, adminUsers, adminServices, adminActivations, adminSupport, adminNotifications, adminReconciliation, adminHealth] = await Promise.all([
    read('frontend/src/app/App.tsx'),
    read('frontend/src/features/admin/AdminShell.tsx'),
    read('frontend/src/features/admin/AdminUsers.tsx'),
    read('frontend/src/features/admin/AdminServices.tsx'),
    read('frontend/src/features/admin/AdminActivations.tsx'),
    read('frontend/src/features/admin/AdminSupport.tsx'),
    read('frontend/src/features/admin/AdminNotifications.tsx'),
    read('frontend/src/features/admin/AdminReconciliation.tsx'),
    read('frontend/src/features/admin/AdminSystemHealth.tsx')
  ]);

  assert.match(app, /path:'\/',Component:AppShell/);
  assert.match(app, /path:'\/admin',Component:AdminAccessGate/);
  assert.match(app, /path:'apps',Component:AppsPage/);
  assert.match(app, /path:'buy',Component:BuyPage/);
  assert.match(app, /path:'active',Component:ActivePage/);
  assert.match(app, /path:'wallet',Component:WalletPage/);
  assert.match(app, /path:'support',Component:SupportPage/);
  assert.match(app, /path:'account',Component:AccountPage/);
  assert.match(app, /path:'users',children/);
  assert.match(app, /path:'services',Component:AdminServicesPage/);
  assert.match(app, /path:'activations',Component:AdminActivationsPage/);
  assert.match(app, /path:'payments',Component:AdminPaymentsPage/);
  assert.match(app, /path:'support',Component:AdminSupportPage/);
  assert.match(app, /path:'notifications',Component:AdminNotificationsPage/);
  assert.match(app, /path:'reconciliation',Component:AdminReconciliationPage/);
  assert.match(app, /path:'health',Component:AdminSystemHealthPage/);
  assert.doesNotMatch(app, /path:'admin\/buy'/);
  assert.doesNotMatch(app, /path:'admin\/apps'/);
  assert.doesNotMatch(app, /path:'admin\/active'/);

  assert.match(shell, /user\.role!=='admin'/);
  assert.match(shell, /No Buy, service marketplace, wallet or OTP workspace is mounted/);
  assert.doesNotMatch(adminUsers, /BottomNav|BuyServiceWorkspace|createActivation/);
  assert.doesNotMatch(adminServices, /BottomNav|BuyServiceWorkspace|createActivation/);
  assert.doesNotMatch(adminActivations, /BottomNav|BuyServiceWorkspace|createActivation/);
  assert.doesNotMatch(adminSupport, /BottomNav|BuyServiceWorkspace|createActivation/);
  assert.doesNotMatch(adminNotifications, /BottomNav|BuyServiceWorkspace|createActivation/);
  assert.doesNotMatch(adminReconciliation, /BottomNav|BuyServiceWorkspace|createActivation/);
  assert.doesNotMatch(adminHealth, /BottomNav|BuyServiceWorkspace|createActivation/);
});

test('phase 11.10 admin write endpoints retain authentication, origin and payload safeguards', async () => {
  const [server, userById, serviceById, activationById, rechargeById, supportById, notifications, walletRecon, paymentSettings] = await Promise.all([
    read('server.js'),
    read('api/admin/users/_id.js'),
    read('api/admin/services/_id.js'),
    read('api/admin/activations/_id.js'),
    read('api/admin/recharges/_id.js'),
    read('api/admin/support/_id.js'),
    read('api/admin/_notifications.js'),
    read('api/admin/_wallet-reconciliation.js'),
    read('api/admin/_payment-settings.js')
  ]);

  const requiredRoutes = [
    'POST /api/admin/recharges/:id',
    'POST /api/admin/notifications',
    'POST /api/admin/wallet-reconciliation',
    'PATCH /api/admin/wallet-reconciliation',
    'PATCH /api/admin/payment-settings',
    'PATCH /api/admin/services/:id'
  ];
  for (const route of requiredRoutes) assert.match(server, new RegExp(route.replace(/[.*+?^{}()|[\\]\\]/g, '\\$&')));

  for (const [name, source] of [
    ['user operations', userById],
    ['service updates', serviceById],
    ['activation cancellation', activationById],
    ['recharge review', rechargeById],
    ['support updates', supportById],
    ['targeted notifications', notifications],
    ['wallet reconciliation controls', walletRecon],
    ['payment settings', paymentSettings]
  ]) {
    assert.match(source, /requireAdmin|user\.role !== ['"]admin['"]/u, name);
    assert.match(source, /enforceSameOrigin/u, name);
  }

  assert.match(supportById, /validateBodySize/);
  assert.match(notifications, /validateBodySize/);
  assert.match(walletRecon, /rateLimitAsync/);
  assert.match(paymentSettings, /validateBodySize/);
});

test('phase 11.10 frontend runtime has crash recovery and stale-bundle retirement', async () => {
  const [app, main, servicesTest] = await Promise.all([
    read('frontend/src/app/App.tsx'),
    read('frontend/src/main.tsx'),
    read('tests/frontend-service-catalog.test.js')
  ]);

  assert.match(app, /class AppErrorBoundary extends Component/);
  assert.match(app, /function RouteErrorScreen\(\)/);
  assert.match(app, /errorElement:<RouteErrorScreen\/>/);
  assert.match(app, /<AppErrorBoundary>/);
  assert.match(app, /Array\.isArray\(q\.data\?\.services\)/);
  assert.match(app, /Loading services\.\.\./);
  assert.match(main, /serviceWorker\.getRegistrations\(\)/);
  assert.match(main, /registration\.unregister\(\)/);
  assert.match(main, /key\.startsWith\('inbox9-shell-'\)/);
  assert.doesNotMatch(main, /serviceWorker\.register\(['"]\/sw\.js['"]\)/);
  assert.match(servicesTest, /Array\.isArray/);
});

test('phase 11.10 backend route contract covers every shipped admin surface', async () => {
  const server = await read('server.js');
  const expected = [
    'GET /api/admin/overview',
    'GET /api/admin/recharges',
    'POST /api/admin/recharges/:id',
    'GET /api/admin/users',
    'GET /api/admin/services',
    'PATCH /api/admin/services/:id',
    'GET /api/admin/activations',
    'GET /api/admin/ledger',
    'GET /api/admin/providers',
    'GET /api/admin/providers-health',
    'GET /api/admin/audit',
    'GET /api/admin/support',
    'GET /api/admin/notifications',
    'POST /api/admin/notifications',
    'GET /api/admin/wallet-reconciliation',
    'POST /api/admin/wallet-reconciliation',
    'PATCH /api/admin/wallet-reconciliation',
    'GET /api/admin/payment-reconciliation',
    'GET /api/admin/payment-settings',
    'PATCH /api/admin/payment-settings',
    'GET /api/admin/provider-operations',
    'GET /api/admin/system-health'
  ];
  for (const route of expected) assert.match(server, new RegExp(route.replace(/[.*+?^{}()|[\\]\\]/g, '\\$&')));

  for (const sourcePath of [
    'api/admin/_overview.js',
    'api/admin/recharges/_index.js',
    'api/admin/recharges/_id.js',
    'api/admin/_users.js',
    'api/admin/_services.js',
    'api/admin/services/_id.js',
    'api/admin/_activations.js',
    'api/admin/_ledger.js',
    'api/admin/_providers.js',
    'api/admin/_providers-health.js',
    'api/admin/_audit.js',
    'api/admin/support/_index.js',
    'api/admin/support/_id.js',
    'api/admin/_notifications.js',
    'api/admin/_wallet-reconciliation.js',
    'api/admin/_payment-reconciliation.js',
    'api/admin/_payment-settings.js',
    'api/admin/_provider-operations.js',
    'api/admin/_system-health.js'
  ]) {
    const source = await read(sourcePath);
    assert.match(source, /requireAdmin|user\.role !== ['"]admin['"]/u, sourcePath);
  }
});

test('phase 11.10 accounting and operational safeguards remain non-mutating where required', async () => {
  const [wallet, recon, health] = await Promise.all([
    read('api/_lib/wallet-repository.js'),
    read('api/_lib/wallet-reconciliation.js'),
    read('api/admin/_system-health.js')
  ]);

  assert.match(wallet, /Verified payment amount and UTR are required before approval/);
  assert.match(wallet, /recordAuditTx\(client, adminUserId, ['"]recharge\.approve['"]/);
  assert.match(wallet, /recordAuditTx\(client, adminUserId, ['"]recharge\.reject['"]/);
  assert.doesNotMatch(recon, /UPDATE wallets SET balance_paise/);
  assert.doesNotMatch(recon, /UPDATE wallet_ledger SET/);
  assert.doesNotMatch(health, /DATABASE_URL/);
  assert.doesNotMatch(health, /CRON_SECRET/);
  assert.doesNotMatch(health, /SENTRY_DSN/);
});
