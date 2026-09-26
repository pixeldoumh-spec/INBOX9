import assert from 'node:assert/strict';
import { test } from 'node:test';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function resetEnv() {
  for (const key of [
    'INBOX9_RUN_BILLABLE_PROVIDER_CANARY',
    'INBOX9_PROVIDER_CANARY_MAX_COST_USD',
    'INBOX9_PROVIDER_CANARY_MAX_WAIT_MS',
    'INBOX9_PROVIDER_CANARY_POLL_INTERVAL_MS',
    'INBOX9_SVNUMBER_API_KEY',
    'INBOX9_ASMS_API_KEY',
    'INBOX9_PVAPINS_API_KEY',
  ]) delete process.env[key];
  Object.assign(process.env, originalEnv);
}

test.afterEach(() => {
  global.fetch = originalFetch;
  resetEnv();
});

test('external lifecycle canary is fail-closed and performs no provider request by default', async () => {
  delete process.env.INBOX9_RUN_BILLABLE_PROVIDER_CANARY;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error('provider request must not run');
  };
  const { runExternalLifecycleCertification } = await import('../api/_lib/provider-lifecycle-certification.js');
  await assert.rejects(
    () => runExternalLifecycleCertification(null, {
      providerId: 'provider-svnumber',
      serviceId: 'svc-test',
      confirmation: 'RUN_ONE_BILLABLE_CANARY',
    }),
    (error) => error.code === 'EXTERNAL_CANARY_DISABLED',
  );
  assert.equal(fetchCalls, 0);
});

test('synthetic lifecycle certification completes reserve, poll, cancel and records non-billable evidence', async () => {
  if (!process.env.INBOX9_TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  const { runSyntheticLifecycleCertification } = await import('../api/_lib/provider-lifecycle-certification.js');
  const result = await runSyntheticLifecycleCertification();
  assert.equal(result.status, 'passed');
  assert.equal(result.billable, false);
  assert.equal(result.reserveOk, true);
  assert.equal(result.pollOk, true);
  assert.equal(result.cancellationOk, true);
  assert.equal(result.cleanupOk, true);
  assert.ok(result.certificationId);
});

test('mocked SMS Verification Number lifecycle completes reserve, OTP polling and durable certification', async () => {
  if (!process.env.INBOX9_TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  process.env.INBOX9_RUN_BILLABLE_PROVIDER_CANARY = 'true';
  process.env.INBOX9_PROVIDER_CANARY_MAX_COST_USD = '1';
  process.env.INBOX9_PROVIDER_CANARY_MAX_WAIT_MS = '5000';
  process.env.INBOX9_PROVIDER_CANARY_POLL_INTERVAL_MS = '1000';
  process.env.INBOX9_SVNUMBER_API_KEY = 'test-key';
  delete process.env.INBOX9_ASMS_API_KEY;
  delete process.env.INBOX9_PVAPINS_API_KEY;

  const pool = await (await import('../api/_lib/db.js')).getPool();
  const { services } = await import('../api/_lib/catalog.js');
  const target = services[0];
  const providerId = 'provider-svnumber';
  const providerCode = 'sv-test';
  await pool.query('DELETE FROM provider_service_mappings WHERE provider_id=$1 AND service_id=$2', [providerId, target.id]);
  await pool.query(
    'INSERT INTO provider_service_mappings(provider_id,service_id,provider_service_code,active) VALUES ($1,$2,$3,TRUE)',
    [providerId, target.id, providerCode],
  );

  const calls = [];
  global.fetch = async (url, options = {}) => {
    const targetUrl = String(url);
    calls.push({ url: targetUrl, options });
    if (targetUrl.includes('getCountryAndOperators')) {
      return new Response(JSON.stringify([{ id: 14, name: 'India', operators: { any: 'any' } }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (targetUrl.includes('getServicesAndCostWithStatistics')) {
      return new Response(JSON.stringify([{ id: providerCode, name: target.name, price: 0.2, quantity: 5, deliverability: '90' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (targetUrl.includes('action=getBalance')) return new Response('10', { status: 200 });
    if (targetUrl.includes('action=getNumber')) return new Response('ACCESS_NUMBER:99:919999000009', { status: 200 });
    if (targetUrl.includes('action=getStatus')) return new Response('STATUS_OK:123456', { status: 200 });
    throw new Error('unexpected request ' + targetUrl);
  };

  const { runExternalLifecycleCertification, listLifecycleCertifications } = await import('../api/_lib/provider-lifecycle-certification.js');
  try {
    const result = await runExternalLifecycleCertification(null, {
      providerId,
      serviceId: target.id,
      confirmation: 'RUN_ONE_BILLABLE_CANARY',
    });
    assert.equal(result.status, 'passed');
    assert.equal(result.billable, true);
    assert.equal(result.reserveOk, true);
    assert.equal(result.pollOk, true);
    assert.equal(result.completionOk, true);
    assert.equal(result.cleanupOk, true);
    assert.ok(calls.some((call) => call.url.includes('action=getNumber')));
    assert.ok(calls.some((call) => call.url.includes('action=getStatus')));
    const evidence = await listLifecycleCertifications({ providerId, limit: 5 });
    assert.equal(evidence[0].certificationId, result.certificationId);
    assert.equal(evidence[0].status, 'passed');
    assert.equal(evidence[0].billable, true);
  } finally {
    await pool.query('DELETE FROM provider_lifecycle_certifications WHERE provider_id=$1', [providerId]);
    await pool.query('DELETE FROM provider_service_mappings WHERE provider_id=$1 AND service_id=$2', [providerId, target.id]);
  }
});
