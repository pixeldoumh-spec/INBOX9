import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSyntheticIdentity, generateSyntheticInventory, generateSyntheticOtp, normalizeCapacity, syntheticOtpTiming } from '../api/_lib/synthetic-otp.js';

test('synthetic identity is deterministic and non-routable', () => {
  const a = generateSyntheticIdentity('WhatsApp', 1);
  const b = generateSyntheticIdentity('WhatsApp', 1);
  assert.equal(a, b);
  assert.match(a, /^SIM-IN-[A-F0-9]{10}-0001$/);
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
