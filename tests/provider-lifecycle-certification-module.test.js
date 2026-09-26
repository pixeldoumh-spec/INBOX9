import assert from 'node:assert/strict';
import { test } from 'node:test';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

test.afterEach(() => {
  global.fetch = originalFetch;
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
});

test('lifecycle certification module exposes safe preflight and latest successful lookup', async () => {
  if (!process.env.INBOX9_TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  const { preflightExternalLifecycleCertification, listLifecycleCertifications } = await import('../api/_lib/provider-lifecycle-certification.js');
  const rows = await listLifecycleCertifications({ providerId: 'provider-svnumber', limit: 5 });
  assert.ok(Array.isArray(rows));
  delete process.env.INBOX9_SVNUMBER_API_KEY;
  const result = await preflightExternalLifecycleCertification({
    providerId: 'provider-svnumber',
    serviceId: 'svc-whatsapp',
  }).catch((error) => ({ status: 'error', code: error.code }));
  assert.ok(result.status === 'blocked' || result.status === 'error');
});

test('synthetic lifecycle certification evidence is durable and never records an OTP', async () => {
  if (!process.env.INBOX9_TEST_DATABASE_URL) return;
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  const { runSyntheticLifecycleCertification, listLifecycleCertifications } = await import('../api/_lib/provider-lifecycle-certification.js');
  const result = await runSyntheticLifecycleCertification();
  const rows = await listLifecycleCertifications({ providerId: 'provider-mock', limit: 1 });
  assert.equal(result.status, 'passed');
  assert.equal(rows[0].status, 'passed');
  assert.equal(rows[0].billable, false);
  assert.equal(rows[0].details.terminalStatus, 'Refunded');
  assert.equal(Object.prototype.hasOwnProperty.call(rows[0].details, 'otp'), false);
});
