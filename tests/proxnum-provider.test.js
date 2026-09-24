import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProxnumPrices,
  normalizeProxnumActivation,
} from '../api/_lib/proxnum-provider.js';
import {
  getProxnumServiceCode,
  isProxnumServiceBlocked,
} from '../api/_lib/proxnum-inventory-repository.js';

test('normalizes Proxnum India price inventory', () => {
  const rows = normalizeProxnumPrices({
    success: true,
    prices: {
      '6': {
        wa: { base_price: 0.0389, sell_price: 0.1298737, available: 189 },
        ig: { base_price: 0.0334, sell_price: 0.1114892, available: 245 },
      },
    },
  });
  assert.deepEqual(rows, [
    { code: 'wa', available: 189, basePriceUsd: 0.0389, sellPriceUsd: 0.1298737 },
    { code: 'ig', available: 245, basePriceUsd: 0.0334, sellPriceUsd: 0.1114892 },
  ]);
});

test('normalizes Proxnum activation with provider-owned identifier', () => {
  const activation = normalizeProxnumActivation({
    success: true,
    activation: {
      id: 737,
      phone: '919876543210',
      activation_id: '4390520873',
      date_created: '2026-09-24 10:00:00',
      status: 1,
    },
  });
  assert.equal(activation.providerActivationId, '4390520873');
  assert.equal(activation.number, '919876543210');
  assert.equal(activation.status, 'Active');
});

test('maps supported service names and blocks high-risk catalogue names from automatic real-provider routing', () => {
  assert.equal(getProxnumServiceCode({ id: 'whatsapp-0', name: 'WhatsApp', category: 'Social' }), 'wa');
  assert.equal(getProxnumServiceCode({ id: 'instagram-2', name: 'Instagram', category: 'Social' }), 'ig');
  assert.equal(getProxnumServiceCode({ id: 'signal-1', name: 'Signal', category: 'Messaging' }), 'bw');
  assert.equal(getProxnumServiceCode({ id: 'rummy-1', name: 'RUMMY91', category: 'Rummy' }), null);
  assert.equal(isProxnumServiceBlocked({ name: 'Bingo Bet', category: 'Games' }), true);
});
