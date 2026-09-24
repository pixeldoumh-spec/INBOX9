import test from 'node:test';
import assert from 'node:assert/strict';
import { decideExpirationAction } from '../api/_lib/provider-operations.js';

test('expired activation with completed provider state completes with OTP', () => {
  assert.equal(
    decideExpirationAction(
      { status: 'ExpirationPending', expires_at: new Date(Date.now() - 1000).toISOString() },
      { status: 'Completed', otp: '123 456' },
    ),
    'completed',
  );
});

test('expired activation with expired provider state transitions to Expired', () => {
  assert.equal(
    decideExpirationAction(
      { status: 'ExpirationPending', expires_at: new Date(Date.now() - 1000).toISOString() },
      { status: 'Expired', otp: null },
    ),
    'expired',
  );
});

test('expired activation with provider still Active requests provider release', () => {
  assert.equal(
    decideExpirationAction(
      { status: 'ExpirationPending', expires_at: new Date(Date.now() - 1000).toISOString() },
      { status: 'Active', otp: null },
    ),
    'cancel-provider',
  );
});

test('expiration worker ignores activations whose state changed away from ExpirationPending', () => {
  assert.equal(
    decideExpirationAction(
      { status: 'Completed', expires_at: new Date(Date.now() - 1000).toISOString() },
      { status: 'Expired', otp: null },
    ),
    'noop',
  );
});

test('provider status outside the supported lifecycle is retryable', () => {
  assert.equal(
    decideExpirationAction(
      { status: 'ExpirationPending', expires_at: new Date(Date.now() - 1000).toISOString() },
      { status: 'Unknown', otp: null },
    ),
    'unsupported',
  );
});

