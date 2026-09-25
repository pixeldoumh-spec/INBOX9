import test from 'node:test';
import assert from 'node:assert/strict';
import { services } from '../api/_lib/catalog.js';
import { syntheticProvider } from '../api/_lib/synthetic-provider.js';
import { normalizeProviderActivation } from '../api/_lib/provider.js';

test('synthetic engine reserves a normalized India-format activation', async () => {
  const service = services[0];
  const activation = await syntheticProvider.reserveNumber(service);
  assert.equal(activation.serviceId, service.id);
  assert.equal(activation.serviceName, service.name);
  assert.match(activation.providerActivationId, /^SYN-/);
  assert.match(activation.number, /^\+91 [6-9]\d{4} \d{5}$/);
  assert.equal(activation.number.replace('+91 ', '').replace(/\s/g, '').length, 10);
  assert.equal(activation.status, 'Active');
  assert.ok(activation.expiresAt > activation.createdAt);
  assert.ok(activation.mockOtpAt > activation.createdAt);
  assert.equal(activation.metadata.numberRevealAt - activation.createdAt, 5_000);
  assert.equal(activation.mockOtpAt - activation.metadata.numberRevealAt, 15_000);
  assert.equal(activation.metadata.capacityPerService, 100);
});

test('synthetic lifecycle transitions and cancellation are normalized', async () => {
  const service = services[1];
  const created = await syntheticProvider.reserveNumber(service);
  const cancelled = await syntheticProvider.cancelActivation({ providerActivationId: created.providerActivationId, activation: created });
  assert.equal(cancelled.status, 'Refunded');
  assert.equal(normalizeProviderActivation(cancelled).providerActivationId, created.providerActivationId);
});

test('synthetic engine returns a deterministic OTP after availability time', async () => {
  const service = services[2];
  const created = await syntheticProvider.reserveNumber(service);
  const simulated = { ...created, mockOtpAt: Date.now() - 1 };
  const completed = await syntheticProvider.getActivation({ activation: simulated });
  assert.equal(completed.status, 'Completed');
  assert.match(completed.otp, /^\d{6}$/);
});
