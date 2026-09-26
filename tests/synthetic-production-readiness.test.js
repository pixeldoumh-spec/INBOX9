import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { fulfillmentMode } from '../api/_lib/runtime-config.js';
import { syntheticProvider } from '../api/_lib/synthetic-provider.js';

const EXPECTED_SERVICE_COUNT = 90;
const SYNTHETIC_TTL_MS = 20 * 60 * 1000;
const SYNTHETIC_OTP_DELAY_MS = 20 * 1000;

test('synthetic production readiness catalog contains exactly 90 unique services', async () => {
  const rows = JSON.parse(await fs.readFile(new URL('../data/services.json', import.meta.url), 'utf8'));
  assert.equal(rows.length, EXPECTED_SERVICE_COUNT);
  assert.equal(new Set(rows.map((row) => String(row[0]).trim().toLowerCase())).size, EXPECTED_SERVICE_COUNT);
});

test('fulfillment mode defaults to synthetic and requires an explicit external switch', () => {
  const previous = process.env.INBOX9_FULFILLMENT_MODE;
  try {
    delete process.env.INBOX9_FULFILLMENT_MODE;
    assert.equal(fulfillmentMode(), 'synthetic');
    process.env.INBOX9_FULFILLMENT_MODE = 'external';
    assert.equal(fulfillmentMode(), 'external');
  } finally {
    if (previous == null) delete process.env.INBOX9_FULFILLMENT_MODE;
    else process.env.INBOX9_FULFILLMENT_MODE = previous;
  }
});

test('synthetic fulfillment uses a 20-minute activation and 20-second OTP contract', async () => {
  const activation = await syntheticProvider.reserveNumber({
    id: 'synthetic-readiness-service',
    name: 'Synthetic Readiness Service',
  });
  assert.equal(activation.expiresAt - activation.createdAt, SYNTHETIC_TTL_MS);
  assert.equal(activation.mockOtpAt - activation.createdAt, SYNTHETIC_OTP_DELAY_MS);
  assert.equal(activation.metadata?.country, 'IN');
  assert.equal(activation.metadata?.engine, 'synthetic');
});
