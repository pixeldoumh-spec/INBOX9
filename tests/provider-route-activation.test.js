import assert from 'node:assert/strict';
import { test } from 'node:test';

const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of [
    'INBOX9_ENABLE_EXTERNAL_ROUTING',
    'INBOX9_ALLOW_NONCANCELLABLE_PROVIDER_RESERVE',
    'INBOX9_ASMS_API_KEY',
    'INBOX9_PVAPINS_API_KEY',
    'INBOX9_SVNUMBER_API_KEY',
    'INBOX9_PROVIDER_CERT_MAX_AGE_MS',
  ]) delete process.env[key];
  Object.assign(process.env, originalEnv);
}

test.afterEach(restoreEnv);

test('external route activation fails closed while production external routing is disabled', async () => {
  process.env.INBOX9_ENABLE_EXTERNAL_ROUTING = 'false';
  delete process.env.INBOX9_SVNUMBER_API_KEY;
  if (!process.env.INBOX9_TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';

  const { preflightExternalRouteActivation } = await import('../api/_lib/provider-route-activation.js');
  const result = await preflightExternalRouteActivation({
    providerId: 'provider-svnumber',
    serviceId: 'svc-whatsapp',
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some(blocker => blocker.code === 'EXTERNAL_ROUTING_DISABLED'));
  assert.ok(result.blockers.some(blocker => blocker.code === 'CREDENTIALS_REQUIRED'));
});

test('external route activation requires a service-specific successful lifecycle certificate', async () => {
  process.env.INBOX9_ENABLE_EXTERNAL_ROUTING = 'true';
  process.env.INBOX9_ALLOW_NONCANCELLABLE_PROVIDER_RESERVE = 'false';
  process.env.INBOX9_SVNUMBER_API_KEY = 'test-key';
  if (!process.env.INBOX9_TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';

  const pool = await (await import('../api/_lib/db.js')).getPool();
  const { services } = await import('../api/_lib/catalog.js');
  const service = services[0];
  const providerId = 'provider-svnumber';
  const mappingCode = 'phase85-test';
  const original = await pool.query(
    'SELECT active,provider_service_code FROM provider_service_mappings WHERE provider_id=$1 AND service_id=$2',
    [providerId, service.id],
  );
  await pool.query(
    'INSERT INTO provider_service_mappings(provider_id,service_id,provider_service_code,active) VALUES ($1,$2,$3,TRUE) ON CONFLICT (provider_id,service_id) DO UPDATE SET provider_service_code=EXCLUDED.provider_service_code,active=TRUE',
    [providerId, service.id, mappingCode],
  );

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify([{ id: mappingCode, name: service.name, price: 0.20, quantity: 5 }]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  try {
    const { preflightExternalRouteActivation } = await import('../api/_lib/provider-route-activation.js');
    const result = await preflightExternalRouteActivation({ providerId, serviceId: service.id });
    assert.equal(result.status, 'blocked');
    assert.ok(result.blockers.some(blocker => blocker.code === 'LIFECYCLE_CERTIFICATION_REQUIRED'));
  } finally {
    global.fetch = originalFetch;
    if (original.rowCount) {
      await pool.query(
        'UPDATE provider_service_mappings SET active=$3,provider_service_code=$4 WHERE provider_id=$1 AND service_id=$2',
        [providerId, service.id, original.rows[0].active, original.rows[0].provider_service_code],
      );
    } else {
      await pool.query(
        'DELETE FROM provider_service_mappings WHERE provider_id=$1 AND service_id=$2',
        [providerId, service.id],
      );
    }
  }
});

test('synthetic route remains immutable under external route controls', async () => {
  if (!process.env.INBOX9_TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';

  const { setExternalRouteActive } = await import('../api/_lib/provider-route-activation.js');
  await assert.rejects(
    () => setExternalRouteActive(null, { providerId: 'provider-mock', serviceId: 'svc-whatsapp', active: false }),
    error => error.code === 'SYNTHETIC_ROUTE_IMMUTABLE',
  );
});
