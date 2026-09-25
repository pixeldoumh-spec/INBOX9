import test from 'node:test';
import assert from 'node:assert/strict';
import { services, getService } from '../api/_lib/catalog.js';
import { reserveMock, getMock, cancelMock, resetMocks } from '../api/_lib/mock.js';

const removedServiceIds = [
  'svc-yono-bonus-51','svc-all-yono-games','svc-yono-all-games','svc-rani-slots','svc-yono-app',
  'svc-new-yono-app','svc-yono-game','svc-all-rummy-apps','svc-all-yono-slots','svc-yono-arcade',
  'svc-download-rummy-365','svc-koko-slots','svc-download-yono-rummy','svc-diva-ace','svc-diva-lucky',
  'svc-diva-king','svc-diva-x','svc-diva-top','svc-divavip','svc-diva-game','svc-diva-slots',
  'svc-diva-777','svc-diva-2026'
];

test('catalog contains the cleaned 2026-09-25 active service set', () => {
  assert.equal(services.length, 193);
  assert.equal(services[0].id, 'svc-joy-rummy');
  assert.deepEqual(services.map((service) => service.name).slice(0, 3), ['Joy Rummy', 'IND Rummy', 'INR Rummy']);
  assert.equal(new Set(services.map((service) => service.id)).size, services.length);
  assert.equal(services.every((s) => s.country === 'IN' && s.currency === 'INR'), true);
  assert.equal(getService('svc-joy-rummy')?.name, 'Joy Rummy');
  for (const id of removedServiceIds) assert.equal(getService(id), null, id);
  assert.equal(services.some((service) => /^Diva/i.test(service.name)), false);
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
