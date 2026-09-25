import test from 'node:test';
import assert from 'node:assert/strict';
import { services, getService } from '../api/_lib/catalog.js';
import { reserveMock, getMock, cancelMock, resetMocks } from '../api/_lib/mock.js';

test('catalog ends at the requested Diwa Play cutoff', () => {
  assert.equal(services.length, 90);
  assert.equal(services[0].id, 'svc-joy-rummy');
  assert.equal(services.at(-1).id, 'svc-diwa-play');
  assert.equal(services.at(-1).name, 'Diwa Play');
  assert.deepEqual(services.map((service) => service.name).slice(0, 3), ['Joy Rummy', 'IND Rummy', 'INR Rummy']);
  assert.equal(new Set(services.map((service) => service.id)).size, services.length);
  assert.equal(services.every((s) => s.country === 'IN' && s.currency === 'INR'), true);
  assert.equal(getService('svc-diwa-play')?.name, 'Diwa Play');
  assert.equal(getService('svc-diwa-bet'), null);
  assert.equal(getService('svc-jeet-spin'), null);
  assert.equal(getService('svc-rummy-gold'), null);
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
