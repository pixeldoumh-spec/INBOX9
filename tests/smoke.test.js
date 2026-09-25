import test from 'node:test';
import assert from 'node:assert/strict';
import { services, getService } from '../api/_lib/catalog.js';
import { reserveMock, getMock, cancelMock, resetMocks } from '../api/_lib/mock.js';

test('catalog contains exactly the 2026-09-25 master service set', () => {
  assert.equal(services.length, 216);
  assert.equal(services[0].id, 'svc-yono-bonus-51');
  assert.equal(services.at(-1).id, 'svc-rummy-grand');
  assert.equal(new Set(services.map((service) => service.id)).size, services.length);
  assert.deepEqual(services.map((service) => service.name).slice(0, 3), ['Yono Bonus 51', 'Joy Rummy', 'IND Rummy']);
  assert.equal(services.every((s) => s.country === 'IN' && s.currency === 'INR'), true);
  assert.equal(getService('svc-yono-bonus-51')?.name, 'Yono Bonus 51');
});

test('mock activation can be reserved and cancelled with full refund amount', () => {
  resetMocks();
  const activation = reserveMock(services[0]);
  assert.equal(activation.status, 'Active');
  const found = getMock(activation.id);
  assert.equal(found.id, activation.id);
  const cancelled = cancelMock(activation.id);
  assert.equal(cancelled.status, 'Refunded');
  assert.equal(cancelled.refundPaise, activation.pricePaise);
});
