import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticProvider } from '../api/_lib/synthetic-provider.js';
import { reserveMock, resetMocks } from '../api/_lib/mock.js';

test('synthetic activations are valid for exactly 20 minutes by default', async () => {
  const activation = await syntheticProvider.reserveNumber({ id: 'validity-test', name: 'Validity Test' });
  assert.equal(activation.expiresAt - activation.createdAt, 20 * 60 * 1000);
});

test('local mock activations are valid for exactly 20 minutes by default', () => {
  resetMocks();
  const activation = reserveMock({ id: 'validity-test', name: 'Validity Test', pricePaise: 100, userEmail: 'validity@example.test' });
  assert.equal(activation.expiresAt - activation.createdAt, 25 * 60 * 1000);
  resetMocks();
});
