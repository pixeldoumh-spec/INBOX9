import test from 'node:test';
import assert from 'node:assert/strict';
import { services, getService } from '../api/_lib/catalog.js';
import { reserveMock, getMock, cancelMock, resetMocks } from '../api/_lib/mock.js';

test('catalog contains the supplied India service set', () => {
  assert.equal(services.length, 76);
  assert.ok(getService('whatsapp-0'));
  assert.ok(getService('moneyrummy-75'));
  assert.equal(services.every((s) => s.country === 'IN' && s.currency === 'INR'), true);
});

test('mock activation can be reserved and cancelled with full refund amount', () => {
  resetMocks();
  const activation = reserveMock(getService('whatsapp-0'));
  assert.equal(activation.status, 'Active');
  const found = getMock(activation.id);
  assert.equal(found.id, activation.id);
  const cancelled = cancelMock(activation.id);
  assert.equal(cancelled.status, 'Refunded');
  assert.equal(cancelled.refundPaise, activation.pricePaise);
});
