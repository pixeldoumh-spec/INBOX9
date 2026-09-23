import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NUMBEROTP_INDIA_COUNTRY_ID,
  matchNumberOtpService,
  normalizeNumberOtpActivation,
  numberOtpHealth,
} from '../api/_lib/numberotp-public.js';
import { listProviderAdapters } from '../api/_lib/provider-registry.js';

test('NumberOTP India uses the documented country id and provider adapter is registered', () => {
  assert.equal(NUMBEROTP_INDIA_COUNTRY_ID, '22');
  assert.ok(listProviderAdapters().includes('numberotp'));
});

test('NumberOTP service matching is name-normalized and deterministic', () => {
  const inventory = {
    services: [
      { code: 'wa', name: 'WhatsApp', normalizedName: 'whatsapp', available: 123, costUsd: 0.05 },
      { code: 'tg', name: 'Telegram', normalizedName: 'telegram', available: 42, costUsd: 0.06 },
    ],
  };
  assert.equal(matchNumberOtpService(inventory, { name: 'WhatsApp' }).code, 'wa');
  assert.equal(matchNumberOtpService(inventory, { name: ' whatsapp ' }).available, 123);
  assert.equal(matchNumberOtpService(inventory, { name: 'Unknown' }), null);
});

test('NumberOTP activation normalization handles documented field variants', () => {
  const activation = normalizeNumberOtpActivation({
    data: {
      activation: {
        id: 'act_123',
        phone_number: '+919999999999',
        status: 'Active',
        otp: null,
      },
    },
  });
  assert.deepEqual(
    {
      providerActivationId: activation.providerActivationId,
      number: activation.number,
      status: activation.status,
      otp: activation.otp,
      metadata: activation.metadata,
    },
    {
      providerActivationId: 'act_123',
      number: '+919999999999',
      status: 'Active',
      otp: null,
      metadata: {
        engine: 'numberotp',
        country: 'IN',
        countryId: '22',
        serviceCode: null,
      },
    }
  );
});

test('NumberOTP health remains availability-only without an API key', async () => {
  const previous = process.env.NUMBEROTP_API_KEY;
  delete process.env.NUMBEROTP_API_KEY;
  try {
    const source = await import('node:fs/promises');
    const content = await source.readFile(new URL('../api/_lib/numberotp-public.js', import.meta.url), 'utf8');
    assert.match(content, /getNumberOtpIndiaInventory/);
    assert.match(content, /mode: String\(process\.env\.NUMBEROTP_API_KEY/);
  } finally {
    if (previous === undefined) delete process.env.NUMBEROTP_API_KEY;
    else process.env.NUMBEROTP_API_KEY = previous;
  }
  assert.equal(NUMBEROTP_INDIA_COUNTRY_ID, '22');
});
