import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSyntheticIdentity,
  generateSyntheticIndianNumber,
  generateSyntheticInventory,
  generateSyntheticOtp,
  normalizeCapacity,
  syntheticOtpTiming,
} from '../api/_lib/synthetic-otp.js';

test('synthetic identity is deterministic and non-routable', () => {
  const a = generateSyntheticIdentity('WhatsApp', 1);
  const b = generateSyntheticIdentity('WhatsApp', 1);
  assert.equal(a, b);
  assert.match(a, /^SIM-IN-[A-F0-9]{10}-0001$/);
});

test('Indian-format synthetic number is deterministic and 10 digits', () => {
  const a = generateSyntheticIndianNumber('WhatsApp', 1);
  const b = generateSyntheticIndianNumber('WhatsApp', 1);
  assert.equal(a, b);
  assert.match(a, /^\+91 [6-9]\d{4} \d{5}$/);
  assert.equal(a.replace(/\D/g, '').length, 12);
});

test('Indian-format synthetic number changes with synthetic identity inputs', () => {
  const a = generateSyntheticIndianNumber('WhatsApp', 1);
  const b = generateSyntheticIndianNumber('WhatsApp', 2);
  const c = generateSyntheticIndianNumber('Instagram', 1);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test('synthetic identity remains authoritative and separate from display number', () => {
  const identity = generateSyntheticIdentity('WhatsApp', 42);
  const number = generateSyntheticIndianNumber('WhatsApp', 42);
  assert.match(identity, /^SIM-IN-[A-F0-9]{10}-0042$/);
  assert.match(number, /^\+91 [6-9]\d{4} \d{5}$/);
  assert.notEqual(identity, number);
});

test('synthetic OTP is deterministic six digits', () => {
  const a = generateSyntheticOtp('Instagram', 42, 'abc');
  const b = generateSyntheticOtp('Instagram', 42, 'abc');
  assert.equal(a, b);
  assert.match(a, /^\d{6}$/);
});

test('synthetic OTP changes when activation nonce changes', () => {
  const a = generateSyntheticOtp('Gmail', 42, 'a');
  const b = generateSyntheticOtp('Gmail', 42, 'b');
  assert.notEqual(a, b);
});

test('inventory respects capacity and has unique identities', () => {
  const inventory = generateSyntheticInventory('WhatsApp', 25);
  assert.equal(inventory.length, 25);
  assert.equal(new Set(inventory.map((x) => x.identity)).size, 25);
});

test('capacity is bounded at 5000', () => {
  assert.equal(normalizeCapacity(5000), 5000);
  assert.throws(() => normalizeCapacity(5001));
  assert.throws(() => generateSyntheticIdentity('X', 0));
});

test('synthetic OTP timing is exactly 20 seconds', () => {
  assert.equal(syntheticOtpTiming('WhatsApp', 1), 20_000);
  assert.equal(syntheticOtpTiming('WhatsApp', 1, 'different-activation'), 20_000);
});
