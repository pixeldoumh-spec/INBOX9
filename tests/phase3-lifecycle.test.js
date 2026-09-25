import assert from 'node:assert/strict';
import test from 'node:test';
import { activationStateIsOngoing } from '../api/_lib/activation-lifecycle.js';

test('ongoing lifecycle includes provider reconciliation states', () => {
  assert.equal(activationStateIsOngoing('Active'), true);
  assert.equal(activationStateIsOngoing('CancellationPending'), true);
  assert.equal(activationStateIsOngoing('ExpirationPending'), true);
  assert.equal(activationStateIsOngoing('Completed'), false);
  assert.equal(activationStateIsOngoing('Expired'), false);
  assert.equal(activationStateIsOngoing('Refunded'), false);
  assert.equal(activationStateIsOngoing('Cancelled'), false);
});

test('terminal activation states remain terminal', () => {
  const terminal = new Set(['Completed', 'Expired', 'Refunded', 'Cancelled']);
  for (const status of terminal) assert.equal(activationStateIsOngoing(status), false);
});
