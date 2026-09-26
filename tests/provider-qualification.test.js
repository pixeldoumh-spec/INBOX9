import assert from 'node:assert/strict';
import { test } from 'node:test';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

test.afterEach(() => {
  global.fetch = originalFetch;
  for (const key of ['INBOX9_PVAPINS_API_KEY','INBOX9_ASMS_API_KEY','INBOX9_SVNUMBER_API_KEY']) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

test('provider qualification reports credentials required without enabling external routing', async () => {
  if (!process.env.INBOX9_TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  delete process.env.INBOX9_PVAPINS_API_KEY;
  delete process.env.INBOX9_ASMS_API_KEY;
  delete process.env.INBOX9_SVNUMBER_API_KEY;
  const { qualifyProviders } = await import('../api/_lib/provider-qualification.js');
  const snapshot = await qualifyProviders();
  assert.equal(snapshot.activeServiceCount, 90);
  const external = snapshot.providers.filter((provider) => provider.adapterKey !== 'synthetic');
  assert.equal(external.length, 3);
  assert.ok(external.every((provider) => provider.status === 'credentials_required'));
  assert.ok(snapshot.services.every((service) => service.providers.synthetic.status === 'live'));
});

test('provider qualification recognizes an exact live provider service-name candidate', async () => {
  if (!process.env.INBOX9_TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  process.env.INBOX9_PVAPINS_API_KEY = 'test-key';
  delete process.env.INBOX9_ASMS_API_KEY;
  delete process.env.INBOX9_SVNUMBER_API_KEY;
  const { services } = await import('../api/_lib/catalog.js');
  const target = services[0];
  const pool = (await import('../api/_lib/db.js')).getPool();
  await pool.query('DELETE FROM provider_service_mappings WHERE provider_id=$1', ['provider-pvapins']);
  await pool.query(
    `INSERT INTO provider_service_mappings(provider_id,service_id,provider_service_code,active)
     VALUES ($1,$2,$3,FALSE)`,
    ['provider-pvapins', target.id, 'stale-code']
  );
  global.fetch = async (url) => {
    const targetUrl = String(url);
    if (targetUrl.endsWith('/api/v1/services')) {
      return new Response(JSON.stringify({ services: [{ code: 'exact-test', name: target.name }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (targetUrl.includes('/api/v1/operators?country=IN')) {
      return new Response(JSON.stringify({ operators: [{ service: 'exact-test', price: 0.15, count: 4 }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected request ' + targetUrl);
  };
  const { qualifyProviders } = await import('../api/_lib/provider-qualification.js');
  const snapshot = await qualifyProviders();
  const row = snapshot.services.find((service) => service.id === target.id);
  assert.equal(row.providers.pvapins.status, 'exact_name_candidate');
  assert.equal(row.providers.pvapins.candidate, 'exact-test');
});

test('provider qualification blocks an empty or mismatched India catalog', async () => {
  if (!process.env.INBOX9_TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  process.env.INBOX9_PVAPINS_API_KEY = 'test-key';
  delete process.env.INBOX9_ASMS_API_KEY;
  delete process.env.INBOX9_SVNUMBER_API_KEY;
  global.fetch = async (url) => {
    const targetUrl = String(url);
    if (targetUrl.endsWith('/api/v1/services')) {
      return new Response(JSON.stringify({ services: [{ code: 'test', name: 'WhatsApp' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (targetUrl.includes('/api/v1/operators?country=IN')) {
      return new Response(JSON.stringify({ operators: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected request ' + targetUrl);
  };
  const { qualifyProviders } = await import('../api/_lib/provider-qualification.js');
  const snapshot = await qualifyProviders();
  const pvapins = snapshot.providers.find((provider) => provider.adapterKey === 'pvapins');
  assert.equal(pvapins.status, 'catalog_unavailable');
  assert.equal(pvapins.catalogCount, 0);
  assert.equal(pvapins.error, 'PROVIDER_INDIA_CATALOG_EMPTY');
});


test('batch exact mapping verifies all 90 active services from unique live provider names', async () => {
  if (!process.env.INBOX9_TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  process.env.INBOX9_ASMS_API_KEY = 'test-key';
  delete process.env.INBOX9_PVAPINS_API_KEY;
  delete process.env.INBOX9_SVNUMBER_API_KEY;
  const { services } = await import('../api/_lib/catalog.js');

  const pool = (await import('../api/_lib/db.js')).getPool();
  await pool.query('DELETE FROM provider_service_mappings WHERE provider_id=$1', ['provider-asms']);

  global.fetch = async (url) => {
    const targetUrl = String(url);
    if (targetUrl.includes('/api/v1/otp/services?country=in')) {
      return new Response(JSON.stringify({
        services: services.map((service, index) => ({
          service: 'asms-svc-' + String(index + 1).padStart(3, '0'),
          name: service.name,
          stock: 10,
          price: 0.5,
        })),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected request ' + targetUrl);
  };

  const { verifyAndSaveExactProviderMappings } = await import('../api/_lib/provider-qualification.js');
  const result = await verifyAndSaveExactProviderMappings(null, { providerId: 'provider-asms' });
  assert.equal(result.verified, true);
  assert.equal(result.mappedCount, 90);

  const count = await pool.query(
    "SELECT COUNT(*)::int AS count FROM provider_service_mappings WHERE provider_id=$1 AND active=TRUE",
    ['provider-asms']
  );
  assert.equal(Number(count.rows[0].count), 90);
});
