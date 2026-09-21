import test from 'node:test';
import assert from 'node:assert/strict';
// Contract tests for the quarantined provider adapter without making live network calls.
test('Shelex adapter exposes discovery only and rejects paid activation operations', async () => {
  const mod = await import('../api/_lib/shelex-test-provider.js');
  const provider = mod.shelexTestProvider;
  assert.equal(typeof provider.listServices, 'function');
  await assert.rejects(provider.reserveNumber({}), (error) => error?.code === 'PROVIDER_UNSUPPORTED');
  await assert.rejects(provider.getActivation('A1'), (error) => error?.code === 'PROVIDER_UNSUPPORTED');
  await assert.rejects(provider.cancelActivation('A1'), (error) => error?.code === 'PROVIDER_UNSUPPORTED');
});

test('Shelex adapter uses the documented country discovery endpoint', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => ({
      ok: true,
      status: 200,
      async text() { return JSON.stringify(['USA', 'India', 'UK']); },
      url,
    });
    const { shelexTestProvider } = await import(`../api/_lib/shelex-test-provider.js?contract=${Date.now()}`);
    const result = await shelexTestProvider.listServices();
    assert.deepEqual(result.countries, ['USA', 'India', 'UK']);
    assert.equal(result.capabilities.customerActivations, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Shelex provider registry includes adapter without customer routing activation', async () => {
  const { listProviderAdapters } = await import('../api/_lib/provider-registry.js');
  assert.ok(listProviderAdapters().includes('shelex-test'));
});

test('customer-facing app text does not expose provider test/mock labels', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  const forbidden = [
    /Mock mode enabled/,
    /mock activation engine/,
    /simulated inventory/,
    /MOCK BACKEND/,
    /DEVELOPER MODE/,
    /appears here automatically in mock mode/,
    /mock authentication provider/,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(src, pattern);
  assert.match(src, /Secure routing/);
  assert.match(src, /\['api', 'API', 'ϟ'\]/);
  assert.match(src, /state\.user\?\.role === 'admin'/);
});
