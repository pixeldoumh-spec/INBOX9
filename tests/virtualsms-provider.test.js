import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVirtualSmsPurchaseConfig, normalizeVirtualSmsOrder } from '../api/_lib/virtualsms-provider.js';

test('VirtualSMS purchase configuration fails closed without credentials', async () => {
  assert.throws(
    () => validateVirtualSmsPurchaseConfig({
      apiKeyValue: '',
      resellerAuthorizedValue: 'true',
      canaryEnabledValue: 'true',
      allowedServiceIds: new Set(['whatsapp-0']),
      serviceId: 'whatsapp-0',
    }),
    (error) => error.code === 'PROVIDER_CREDENTIALS_MISSING'
  );
});

test('VirtualSMS purchase configuration requires authorization, canary mode and allowlist', async () => {
  assert.throws(
    () => validateVirtualSmsPurchaseConfig({
      apiKeyValue: 'test-key',
      resellerAuthorizedValue: 'false',
      canaryEnabledValue: 'true',
      allowedServiceIds: new Set(['whatsapp-0']),
      serviceId: 'whatsapp-0',
    }),
    (error) => error.code === 'PROVIDER_RESELLER_AUTHORIZATION_REQUIRED'
  );
  assert.throws(
    () => validateVirtualSmsPurchaseConfig({
      apiKeyValue: 'test-key',
      resellerAuthorizedValue: 'true',
      canaryEnabledValue: 'false',
      allowedServiceIds: new Set(['whatsapp-0']),
      serviceId: 'whatsapp-0',
    }),
    (error) => error.code === 'PROVIDER_CANARY_DISABLED'
  );
  assert.throws(
    () => validateVirtualSmsPurchaseConfig({
      apiKeyValue: 'test-key',
      resellerAuthorizedValue: 'true',
      canaryEnabledValue: 'true',
      allowedServiceIds: new Set(),
      serviceId: 'whatsapp-0',
    }),
    (error) => error.code === 'VIRTUALSMS_SERVICE_NOT_ALLOWLISTED'
  );
});

test('VirtualSMS order normalization extracts the number, lifecycle and OTP', async () => {
  const active = normalizeVirtualSmsOrder({
    success: true,
    order_id: 'VS-1',
    phone_number: '+919876543210',
    status: 'active',
    created_at: '2026-09-25T10:00:00Z',
    expires_at: '2026-09-25T10:20:00Z',
    service: 'wa',
  });
  assert.equal(active.providerActivationId, 'VS-1');
  assert.equal(active.number, '+919876543210');
  assert.equal(active.status, 'Active');
  assert.equal(active.otp, null);

  const completed = normalizeVirtualSmsOrder({
    success: true,
    order_id: 'VS-1',
    phone_number: '+919876543210',
    status: 'completed',
    messages: [{ content: 'Your code is 123456' }],
  }, active);
  assert.equal(completed.status, 'Completed');
  assert.equal(completed.otp, '123456');
});
