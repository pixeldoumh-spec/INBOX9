import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticProvider } from '../api/_lib/synthetic-provider.js';
import { normalizeProviderActivation } from '../api/_lib/provider.js';

test('synthetic engine reserves a normalized India activation', async () => {
  const activation = await syntheticProvider.reserveNumber({ id: 'whatsapp-0', name: 'WhatsApp', pricePaise: 950 });
  assert.match(activation.providerActivationId, /^SYN-/);
  assert.match(activation.number, /^\\+91 00000 \\d{5}$/);
  assert.equal(activation.status, 'Active');
  assert.ok(activation.expiresAt > activation.createdAt);
  assert.ok(activation.mockOtpAt > activation.createdAt);
  assert.equal(activation.metadata.capacityPerService, 5000);
});

test('synthetic lifecycle transitions and cancellation are normalized', async () => {
  const created = await syntheticProvider.reserveNumber({ id: 'instagram-2', name: 'Instagram', pricePaise: 1100 });
  const cancelled = await syntheticProvider.cancelActivation({ providerActivationId: created.providerActivationId, activation: created });
  assert.equal(cancelled.status, 'Refunded');
  assert.equal(normalizeProviderActivation(cancelled).providerActivationId, created.providerActivationId);
});

test('synthetic engine returns a deterministic OTP after availability time', async () => {
  const created = await syntheticProvider.reserveNumber({ id: 'gmail-5', name: 'Gmail', pricePaise: 1450 });
  const simulated = { ...created, mockOtpAt: Date.now() - 1 };
  const completed = await syntheticProvider.getActivation({ activation: simulated });
  assert.equal(completed.status, 'Completed');
  assert.match(completed.otp, /^\\d{6}$/);
});
