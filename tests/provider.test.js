import test from 'node:test';
import assert from 'node:assert/strict';
import { mockProvider } from '../api/_lib/mock-provider.js';
import { normalizeProviderActivation } from '../api/_lib/provider.js';

test('provider adapter reserves a normalized India activation', async () => {
  const activation = await mockProvider.reserveNumber({ id: 'whatsapp-0', name: 'WhatsApp', pricePaise: 950 });
  assert.match(activation.providerActivationId, /^MOCK-/);
  assert.match(activation.number, /^\+91 /);
  assert.equal(activation.status, 'Active');
  assert.ok(activation.expiresAt > activation.createdAt);
});

test('provider lifecycle transitions and cancellation are normalized', async () => {
  const created = await mockProvider.reserveNumber({ id: 'instagram-2', name: 'Instagram', pricePaise: 1100 });
  const cancelled = await mockProvider.cancelActivation({ providerActivationId: created.providerActivationId, activation: created });
  assert.equal(cancelled.status, 'Refunded');
  assert.equal(normalizeProviderActivation(cancelled).providerActivationId, created.providerActivationId);
});
