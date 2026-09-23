import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractOtpCode,
  normalizeIndianPhone,
  normalizeInventoryRecord,
  normalizeSourceKey,
} from '../api/_lib/number-inventory-repository.js';

test('number inventory source keys are normalized and constrained', () => {
  assert.equal(normalizeSourceKey('  Approved-Provider '), 'approved-provider');
  assert.throws(() => normalizeSourceKey('bad source key'), /Invalid number inventory source key/);
});

test('Indian inventory numbers normalize into canonical +91 E.164 form', () => {
  assert.equal(normalizeIndianPhone('919876543210'), '+919876543210');
  assert.equal(normalizeIndianPhone('+91 98765-43210'), '+919876543210');
  assert.throws(() => normalizeIndianPhone('+14155552671'), /valid \+91 Indian mobile number/);
});

test('provider inventory records are normalized without inventing numbers', () => {
  const row = normalizeInventoryRecord({
    provider_number_id: 'provider-num-1',
    phone_number: '+919876543210',
    capabilities: { sms: true },
    status: 'Available',
  });
  assert.deepEqual(row, {
    providerNumberId: 'provider-num-1',
    phoneNumber: '+919876543210',
    region: null,
    capabilities: { sms: true },
    status: 'Available',
    metadata: {},
  });
});

test('OTP extraction favors labeled codes and rejects ambiguous bodies', () => {
  assert.equal(extractOtpCode('Your verification code is 482931.'), '482931');
  assert.equal(extractOtpCode('OTP: 4812'), '4812');
  assert.equal(extractOtpCode('Codes 1234 and 5678'), null);
  assert.equal(extractOtpCode('Welcome to INBOX9'), null);
});
