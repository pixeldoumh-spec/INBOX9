import assert from 'node:assert/strict';
import { test } from 'node:test';

test('production readiness exposes safe default flags', async () => {
  if (!process.env.INBOX9_TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  delete process.env.INBOX9_PVAPINS_API_KEY;
  delete process.env.INBOX9_ASMS_API_KEY;
  delete process.env.INBOX9_SVNUMBER_API_KEY;
  process.env.INBOX9_ENABLE_EXTERNAL_ROUTING = 'false';
  process.env.INBOX9_ALLOW_NONCANCELLABLE_PROVIDER_RESERVE = 'false';

  const { getProviderProductionReadiness } = await import('../api/_lib/provider-production-readiness.js');
  const snapshot = await getProviderProductionReadiness({ persist: true });
  const synthetic = snapshot.providers.find(row => row.adapterKey === 'synthetic');
  const external = snapshot.providers.filter(row => row.adapterKey !== 'synthetic');

  assert.ok(synthetic);
  assert.equal(synthetic.status, 'ready');
  assert.equal(synthetic.canaryStatus, 'passed');
  assert.equal(external.length, 3);
  assert.ok(external.every(row => row.status === 'blocked'));
  assert.ok(external.every(row => row.blockers.some(blocker => blocker.code === 'CREDENTIALS_REQUIRED')));
  assert.equal(snapshot.externalRoutingEnabled, false);
  assert.equal(snapshot.nonCancellableReserveAllowed, false);
});

test('external readiness requires lifecycle canary and deterministic cancellation', async () => {
  if (!process.env.INBOX9_TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  process.env.INBOX9_ENABLE_EXTERNAL_ROUTING = 'true';
  process.env.INBOX9_ALLOW_NONCANCELLABLE_PROVIDER_RESERVE = 'true';
  process.env.INBOX9_PVAPINS_API_KEY = 'test-key';
  delete process.env.INBOX9_ASMS_API_KEY;
  delete process.env.INBOX9_SVNUMBER_API_KEY;

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/api/v1/services')) {
      return new Response(JSON.stringify({ services: [{ code: 'test-service', name: 'WhatsApp' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (target.endsWith('/api/v1/account')) {
      return new Response(JSON.stringify({ balance: 10 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected provider request: ' + target);
  };

  try {
    const { getProviderProductionReadiness } = await import('../api/_lib/provider-production-readiness.js');
    const snapshot = await getProviderProductionReadiness({ persist: false });
    const pvapins = snapshot.providers.find(row => row.adapterKey === 'pvapins');
    assert.ok(pvapins.blockers.some(blocker => blocker.code === 'LIFECYCLE_CANARY_REQUIRED'));
    assert.ok(pvapins.blockers.some(blocker => blocker.code === 'PROVIDER_CANCELLATION_REQUIRED'));
    assert.equal(pvapins.canaryStatus, 'not_run');
  } finally {
    global.fetch = originalFetch;
  }
});
