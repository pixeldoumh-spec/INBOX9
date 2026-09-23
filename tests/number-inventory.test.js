import test from 'node:test';
import assert from 'node:assert/strict';
import { createNumberInventoryProvider, normalizeProviderNumber } from '../api/_lib/number-provider.js';

test('normalizes a provider-owned India SMS number', () => {
  const value = normalizeProviderNumber({
    providerNumberId: 'num-123',
    phoneNumber: '+919876543210',
    country: 'IN',
    region: 'AP',
    numberType: 'Mobile',
    smsCapable: true,
    voiceCapable: false,
    status: 'available',
  });
  assert.deepEqual(value, {
    providerNumberId: 'num-123',
    phoneNumber: '+919876543210',
    country: 'IN',
    region: 'AP',
    numberType: 'Mobile',
    smsCapable: true,
    voiceCapable: false,
    status: 'available',
    providerMetadata: {},
  });
});

test('rejects provider numbers without a stable provider id or phone number', () => {
  assert.throws(() => normalizeProviderNumber({ phoneNumber: '+919876543210' }));
  assert.throws(() => normalizeProviderNumber({ providerNumberId: 'num-123' }));
});

test('provider contract requires list and health functions', () => {
  const provider = createNumberInventoryProvider({
    listNumbers: async () => [],
    health: async () => ({ healthy: true }),
  });
  assert.equal(typeof provider.listNumbers, 'function');
  assert.equal(typeof provider.health, 'function');
  assert.throws(() => createNumberInventoryProvider({ listNumbers: async () => [] }));
});
