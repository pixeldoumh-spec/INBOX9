import test from 'node:test';
import assert from 'node:assert/strict';
import { services } from '../api/_lib/catalog.js';
import { validateVirtualSmsPurchaseConfig, validateVirtualSmsPreflightPurchaseBlock, normalizeVirtualSmsOrder } from '../api/_lib/virtualsms-provider.js';

const primaryServiceId = services[0].id;

test('VirtualSMS purchase configuration fails closed without credentials', async () => {
  assert.throws(
    () => validateVirtualSmsPurchaseConfig({ apiKeyValue: '', resellerAuthorizedValue: 'true', canaryEnabledValue: 'true', allowedServiceIds: new Set([primaryServiceId]), serviceId: primaryServiceId }),
    (error) => error.code === 'PROVIDER_CREDENTIALS_MISSING'
  );
});

test('VirtualSMS purchase configuration requires authorization, canary mode and allowlist', async () => {
  assert.throws(
    () => validateVirtualSmsPurchaseConfig({ apiKeyValue: 'test-key', resellerAuthorizedValue: 'false', canaryEnabledValue: 'true', allowedServiceIds: new Set([primaryServiceId]), serviceId: primaryServiceId }),
    (error) => error.code === 'PROVIDER_RESELLER_AUTHORIZATION_REQUIRED'
  );
  assert.throws(
    () => validateVirtualSmsPurchaseConfig({ apiKeyValue: 'test-key', resellerAuthorizedValue: 'true', canaryEnabledValue: 'false', allowedServiceIds: new Set([primaryServiceId]), serviceId: primaryServiceId }),
    (error) => error.code === 'PROVIDER_CANARY_DISABLED'
  );
  assert.throws(
    () => validateVirtualSmsPurchaseConfig({ apiKeyValue: 'test-key', resellerAuthorizedValue: 'true', canaryEnabledValue: 'true', allowedServiceIds: new Set(), serviceId: primaryServiceId }),
    (error) => error.code === 'VIRTUALSMS_SERVICE_NOT_ALLOWLISTED'
  );
});

test('VirtualSMS order normalization extracts the number, lifecycle and OTP', async () => {
  const active = normalizeVirtualSmsOrder({ success: true, order_id: 'VS-1', phone_number: '+919876543210', status: 'active', created_at: '2026-09-25T10:00:00Z', expires_at: '2026-09-25T10:20:00Z', service: 'wa' });
  assert.equal(active.providerActivationId, 'VS-1');
  assert.equal(active.number, '+919876543210');
  assert.equal(active.status, 'Active');
  assert.equal(active.otp, null);
  const completed = normalizeVirtualSmsOrder({ success: true, order_id: 'VS-1', phone_number: '+919876543210', status: 'completed', messages: [{ content: 'Your code is 123456' }] }, active);
  assert.equal(completed.status, 'Completed');
  assert.equal(completed.otp, '123456');
});

test('VirtualSMS preflight guard blocks purchase mode by construction', async () => {
  assert.throws(() => validateVirtualSmsPreflightPurchaseBlock('true'), (error) => error.code === 'PROVIDER_PREFLIGHT_PURCHASE_BLOCKED');
  assert.doesNotThrow(() => validateVirtualSmsPreflightPurchaseBlock('false'));
});
