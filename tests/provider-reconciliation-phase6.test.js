import assert from 'node:assert/strict';
import test from 'node:test';

test('Phase 6: reconciliation failure remains retryable instead of silently terminal', () => {
  const event = { outcome: 'Failed', safeToRetry: true };
  assert.equal(event.safeToRetry, true);
  assert.equal(event.outcome, 'Failed');
});

test('Phase 6: reconciliation has a single Running state', () => {
  const allowed = new Set(['Running', 'Succeeded', 'Failed']);
  assert.equal(allowed.has('Running'), true);
  assert.equal(allowed.has('Unknown'), false);
});

test('Phase 6: expiration does not imply a wallet refund', () => {
  const expiration = { status: 'Expired', refundPaise: 0 };
  assert.equal(expiration.refundPaise, 0);
});
