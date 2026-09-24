import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldApplyProviderState } from '../api/_lib/activation-repository.js';

test('provider status applies only to an Active activation', () => {
  assert.equal(shouldApplyProviderState({ status: 'Active', otp: null }, { status: 'Completed', otp: '123 456' }), true);
  assert.equal(shouldApplyProviderState({ status: 'CancellationPending', otp: null }, { status: 'Completed', otp: '123 456' }), false);
  assert.equal(shouldApplyProviderState({ status: 'Refunded', otp: null }, { status: 'Active', otp: null }), false);
});

test('provider polling ignores unsupported or unchanged states', () => {
  assert.equal(shouldApplyProviderState({ status: 'Active', otp: null }, { status: 'Active', otp: null }), false);
  assert.equal(shouldApplyProviderState({ status: 'Active', otp: null }, { status: 'Unknown', otp: null }), false);
  assert.equal(shouldApplyProviderState({ status: 'Active', otp: '111 222' }, { status: 'Completed', otp: '111 222' }), true);
});
