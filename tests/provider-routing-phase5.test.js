import assert from 'node:assert/strict';
import test from 'node:test';
import { failoverDecision, externalRoutingEnabled } from '../api/_lib/provider-routing.js';

test('provider timeout blocks automatic reserve failover because outcome is uncertain', () => {
  const result = failoverDecision(Object.assign(new Error('timed out'), { code: 'PROVIDER_TIMEOUT', status: null }));
  assert.deepEqual(result, { safeToFailover: false, stopChain: true });
});

test('definitive inventory rejection allows controlled failover', () => {
  const result = failoverDecision(Object.assign(new Error('no numbers'), { code: 'NO_AVAILABLE_NUMBERS', status: 503 }));
  assert.deepEqual(result, { safeToFailover: true, stopChain: false });
});

test('HTTP 429 is treated as a rejected request and may move to another provider', () => {
  const result = failoverDecision(Object.assign(new Error('rate limited'), { code: 'HTTP_429', status: 429 }));
  assert.deepEqual(result, { safeToFailover: true, stopChain: false });
});

test('external routing is disabled by default unless explicitly enabled', () => {
  assert.equal(externalRoutingEnabled(), process.env.INBOX9_ENABLE_EXTERNAL_ROUTING === 'true');
});