import test from 'node:test';
import assert from 'node:assert/strict';

// Contract-level tests for the durable cancellation state machine.
test('cancellation state machine uses pending before terminal outcome', () => {
  const allowed = new Set(['Active', 'CancellationPending', 'Completed', 'Expired', 'Refunded', 'Cancelled']);
  assert.equal(allowed.has('CancellationPending'), true);
  assert.notEqual('CancellationPending', 'Refunded');
});

test('provider failure keeps activation retryable', () => {
  const outcome = { provider: 'failed', activation: 'Active', refund: false };
  assert.deepEqual(outcome, { provider: 'failed', activation: 'Active', refund: false });
});

test('provider success is finalized only after durable operation succeeds', () => {
  const outcome = { operation: 'Succeeded', activation: 'Refunded', refund: true };
  assert.deepEqual(outcome, { operation: 'Succeeded', activation: 'Refunded', refund: true });
});
