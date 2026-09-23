import test from 'node:test';
import assert from 'node:assert/strict';
import { resetMocks, reserveMock, getMock, cancelMock } from '../api/_lib/mock.js';

test('mock activation reads and cancellations require the owning user', () => {
  resetMocks();
  const owner = { id: 'USR-1', email: 'owner@example.test' };
  const other = { id: 'USR-2', email: 'other@example.test' };
  const activation = reserveMock({
    id: 'service-1',
    name: 'Test Service',
    pricePaise: 100,
    userId: owner.id,
    userEmail: owner.email,
  });

  assert.equal(getMock(activation.id, other), null);
  assert.equal(cancelMock(activation.id, other), null);
  assert.equal(getMock(activation.id, owner)?.id, activation.id);
  assert.equal(cancelMock(activation.id, owner)?.status, 'Refunded');
  resetMocks();
});
