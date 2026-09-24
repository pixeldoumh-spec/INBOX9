import test from 'node:test';
import assert from 'node:assert/strict';
import {
  telemetryPath,
  startRequestObservation,
  finishRequestObservation,
  observabilitySnapshot,
  captureException
} from '../api/_lib/observability.js';

test('telemetryPath strips query strings and fragments', () => {
  assert.equal(telemetryPath('/api/wallet?token=secret#x'), '/api/wallet');
  assert.equal(telemetryPath('bad-url'), '/bad-url');
  assert.equal(telemetryPath('/'), '/');
});

test('request observations count status classes without throwing', () => {
  const before = observabilitySnapshot();
  const req = { method: 'GET', url: '/api/health?secret=1' };
  const observation = startRequestObservation(req, 'obs-test-1234');
  finishRequestObservation(observation, 503);
  const after = observabilitySnapshot();
  assert.equal(after.counters.requests, before.counters.requests + 1);
  assert.equal(after.counters.apiRequests, before.counters.apiRequests + 1);
  assert.equal(after.counters.http5xx, before.counters.http5xx + 1);
  assert.equal(after.statuses['503'], (before.statuses['503'] || 0) + 1);
  assert.ok(after.topRoutes.some(item => item.path === '/api/health'));
});

test('capturing an exception is fail-safe when external monitoring is unconfigured', () => {
  const before = observabilitySnapshot();
  assert.doesNotThrow(() => captureException(new Error('observability-test'), {
    path: '/api/test',
    method: 'GET',
    statusCode: 500,
    requestId: 'obs-test-5678'
  }));
  const after = observabilitySnapshot();
  assert.equal(after.counters.errors, before.counters.errors + 1);
});
