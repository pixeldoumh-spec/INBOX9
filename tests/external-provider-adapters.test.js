import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function resetEnv() {
  for (const key of [
    'INBOX9_PVAPINS_API_KEY',
    'INBOX9_SVNUMBER_API_KEY',
    'INBOX9_ASMS_API_KEY',
    'INBOX9_ASMS_COUNTRY_MAP_JSON',
  ]) delete process.env[key];
  Object.assign(process.env, originalEnv);
}

test.afterEach(() => {
  global.fetch = originalFetch;
  resetEnv();
});

test('PVAPins adapter uses the documented server-side JSON API and idempotency header', async () => {
  process.env.INBOX9_PVAPINS_API_KEY = 'test-key';
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({
      id: 'pv-order-1',
      phoneNumber: '+919999000001',
      status: 'active',
      expires_in: 1200,
      price: 0.15,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const { pvapinsProvider } = await import('../api/_lib/pvapins-provider.js');
  const result = await pvapinsProvider.reserveNumber({
    id: 'svc-test',
    name: 'Test',
    country: 'IN',
    providerServiceCode: 'test-service',
    idempotencyKey: 'idem-1',
  });
  assert.equal(result.providerActivationId, 'pv-order-1');
  assert.equal(result.number, '+919999000001');
  assert.equal(result.status, 'Active');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\/v1\/orders$/);
  assert.equal(calls[0].options.headers['X-API-Key'], 'test-key');
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'idem-1');
});

test('SMS Verification Number adapter maps ACCESS_NUMBER and STATUS_OK', async () => {
  process.env.INBOX9_SVNUMBER_API_KEY = 'test-key';
  global.fetch = async (url) => {
    const target = String(url);
    if (target.includes('getCountryAndOperators')) {
      return new Response(JSON.stringify([{ id: 14, name: 'India', operators: { any: 'any' } }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (target.includes('action=getNumber')) return new Response('ACCESS_NUMBER:42:919999000002', { status: 200 });
    if (target.includes('action=getStatus')) return new Response('STATUS_OK:654321', { status: 200 });
    throw new Error('unexpected request ' + target);
  };
  const { smsVerificationNumberProvider } = await import('../api/_lib/sms-verification-number-provider.js');
  const result = await smsVerificationNumberProvider.reserveNumber({
    id: 'svc-test',
    name: 'Test',
    country: 'IN',
    providerServiceCode: 'wa',
  });
  assert.equal(result.providerActivationId, '42');
  assert.equal(result.number, '+91919999000002');
  const state = await smsVerificationNumberProvider.getActivation({
    providerActivationId: '42',
    activation: result,
  });
  assert.equal(state.status, 'Completed');
  assert.equal(state.otp, '654321');
});

test('ASMS adapter sends an authenticated order to the documented REST endpoint', async () => {
  process.env.INBOX9_ASMS_API_KEY = 'test-key';
  global.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/api\/v1\/otp\/order$/);
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    return new Response(JSON.stringify({
      activationId: 'asms-order-1',
      phoneNumber: '+919999000003',
      price: 0.5,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const { asmsProvider } = await import('../api/_lib/asms-provider.js');
  const result = await asmsProvider.reserveNumber({
    id: 'svc-test',
    name: 'Test',
    country: 'IN',
    providerServiceCode: 'test-service',
  });
  assert.equal(result.providerActivationId, 'asms-order-1');
  assert.equal(result.number, '+919999000003');
});

test('external adapters require credentials and stay non-production until configured', async () => {
  resetEnv();
  const { pvapinsProvider } = await import('../api/_lib/pvapins-provider.js');
  await assert.rejects(
    () => pvapinsProvider.reserveNumber({ name: 'Test', country: 'IN', providerServiceCode: 'wa' }),
    (error) => error.code === 'PROVIDER_NOT_CONFIGURED'
  );
});
