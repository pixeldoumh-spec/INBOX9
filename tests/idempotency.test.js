import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIdempotencyKey, hashActivationRequest } from '../api/_lib/idempotency.js';

test('idempotency keys require a safe stable format', () => {
  assert.equal(validateIdempotencyKey('purchase-2026-09-21-a1'), 'purchase-2026-09-21-a1');
  assert.throws(() => validateIdempotencyKey('short'), /Idempotency-Key/);
  assert.throws(() => validateIdempotencyKey('bad key with spaces'), /Idempotency-Key/);
});

test('activation request hash is stable and changes with the service', () => {
  assert.equal(hashActivationRequest({ serviceId: 'whatsapp-1' }), hashActivationRequest({ serviceId: 'whatsapp-1' }));
  assert.notEqual(hashActivationRequest({ serviceId: 'whatsapp-1' }), hashActivationRequest({ serviceId: 'gmail-6' }));
});


test('different canonical requests cannot share an idempotency result', () => {
  const a = hashActivationRequest({ serviceId: 'service-a' });
  const b = hashActivationRequest({ serviceId: 'service-b' });
  assert.notEqual(a, b);
});
