import test from 'node:test';
import assert from 'node:assert/strict';
import { services, getService } from '../api/_lib/catalog.js';

test('catalog contains the supplied India service set', () => {
  assert.equal(services.length, 76);
  assert.ok(getService('whatsapp-0'));
  assert.ok(getService('moneyrummy-75'));
  assert.equal(services.every((s) => s.country === 'IN' && s.currency === 'INR'), true);
});

