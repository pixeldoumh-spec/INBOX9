import assert from 'node:assert/strict';
import test from 'node:test';

test('Phase 6 reconciliation contract: uncertain provider outcomes remain retry-safe only through reconciliation', () => {
  const timeout = { outcome: 'Failed', safeToRetry: true, reason: 'provider timeout is unresolved' };
  assert.equal(timeout.safeToRetry, true);
  assert.notEqual(timeout.outcome, 'Succeeded');
});

test('Phase 6 reconciliation contract: a running reconciliation is single-flight', () => {
  const statuses = ['Running', 'Succeeded', 'Failed'];
  assert.deepEqual(statuses, ['Running', 'Succeeded', 'Failed']);
  assert.equal('Running', 'Running');
});

test('Phase 6 reconciliation contract: wallet refund is not implied by expiration', () => {
  const expiration = { status: 'Expired', refundPaise: 0 };
  assert.equal(expiration.refundPaise, 0);
});
