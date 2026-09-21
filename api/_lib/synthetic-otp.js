import crypto from 'node:crypto';

const DEFAULT_CAPACITY = 5000;
const OTP_LENGTH = 6;
const MIN_OTP_DELAY_MS = 3000;
const MAX_OTP_DELAY_MS = 15000;

function assertServiceKey(service) {
  const value = String(service ?? '').trim();
  if (!value) throw new Error('service is required');
  return value;
}

function assertIndex(index, capacity = DEFAULT_CAPACITY) {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 1 || n > capacity) {
    throw new RangeError(`index must be an integer between 1 and ${capacity}`);
  }
  return n;
}

function digestHex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function normalizeCapacity(value = DEFAULT_CAPACITY) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > DEFAULT_CAPACITY) {
    throw new RangeError(`capacity must be an integer between 1 and ${DEFAULT_CAPACITY}`);
  }
  return n;
}

/**
 * Generates non-routable synthetic identities for internal QA/load testing.
 * These are intentionally NOT telephone numbers and must never be sent to a
 * real third-party verification service.
 */
export function generateSyntheticIdentity(service, index, capacity = DEFAULT_CAPACITY) {
  const key = assertServiceKey(service);
  const cap = normalizeCapacity(capacity);
  const n = assertIndex(index, cap);
  const serviceToken = digestHex(`service:${key}`).slice(0, 10).toUpperCase();
  return `SIM-IN-${serviceToken}-${String(n).padStart(4, '0')}`;
}

/**
 * Deterministic OTP for an internal synthetic activation. Same inputs always
 * produce the same OTP, making test assertions reproducible.
 */
export function generateSyntheticOtp(service, index, activationNonce = 'default') {
  const key = assertServiceKey(service);
  const n = assertIndex(index);
  const nonce = String(activationNonce);
  const hex = digestHex(`otp:${key}:${n}:${nonce}`);
  const digits = BigInt(`0x${hex.slice(0, 12)}`) % 1_000_000n;
  return String(digits).padStart(OTP_LENGTH, '0');
}

export function syntheticOtpTiming(service, index, activationNonce = 'default') {
  const key = assertServiceKey(service);
  const n = assertIndex(index);
  const nonce = String(activationNonce);
  const hex = digestHex(`timing:${key}:${n}:${nonce}`);
  const value = Number.parseInt(hex.slice(0, 8), 16);
  const span = MAX_OTP_DELAY_MS - MIN_OTP_DELAY_MS + 1;
  return MIN_OTP_DELAY_MS + (value % span);
}

export function generateSyntheticInventory(service, count = DEFAULT_CAPACITY) {
  const key = assertServiceKey(service);
  const cap = normalizeCapacity(count);
  return Array.from({ length: cap }, (_, i) => {
    const index = i + 1;
    return {
      service: key,
      index,
      identity: generateSyntheticIdentity(key, index, cap),
      otp: generateSyntheticOtp(key, index),
      otpDelayMs: syntheticOtpTiming(key, index),
    };
  });
}
