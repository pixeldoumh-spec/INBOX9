import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeAdapter, invokeProvider, getProviderGatewayMetrics, providerCapabilities, resetProviderGatewayMetrics } from '../api/_lib/provider-gateway.js';
import { listProviderAdapters } from '../api/_lib/provider-registry.js';
import { syntheticProvider } from '../api/_lib/synthetic-provider.js';

test.afterEach(() => resetProviderGatewayMetrics());

test('provider registry contains only the synthetic fulfillment adapter', () => {
  assert.deepEqual(listProviderAdapters(), ['synthetic']);
});

test('provider adapters expose explicit gateway capabilities', () => {
  assert.equal(providerCapabilities(syntheticProvider).cancelActivation, true);
});

test('gateway routes health and records latency metrics', async () => {
  const health = await invokeProvider({
    provider: { id: 'provider-mock', adapter_key: 'synthetic' },
    operation: 'health',
    input: {},
  });
  assert.equal(health.healthy, true);
  const metrics = getProviderGatewayMetrics('provider-mock').find((item) => item.operation === 'health');
  assert.ok(metrics);
  assert.equal(metrics.calls, 1);
  assert.equal(metrics.successes, 1);
  assert.equal(metrics.failures, 0);
  assert.ok(metrics.lastLatencyMs >= 0);
});

test('gateway bounds slow providers with an explicit timeout', async () => {
  const adapter = {
    capabilities: { health: true },
    async health() {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { healthy: true };
    },
  };
  await assert.rejects(
    () => invokeAdapter({
      adapter,
      provider: { id: 'fake-timeout', adapter_key: 'fake' },
      operation: 'health',
      input: {},
      timeoutMs: 10,
    }),
    (error) => {
      assert.equal(error.code, 'PROVIDER_TIMEOUT');
      assert.equal(error.providerId, 'fake-timeout');
      assert.equal(error.operation, 'health');
      assert.equal(error.retryable, true);
      return true;
    }
  );
  const metrics = getProviderGatewayMetrics('fake-timeout').find((item) => item.operation === 'health');
  assert.equal(metrics.timeouts, 1);
  assert.equal(metrics.failures, 1);
});

test('reserve failures are never automatically safe to retry', async () => {
  const adapter = {
    capabilities: { reserveNumber: true },
    async reserveNumber() {
      throw Object.assign(new Error('upstream timeout'), { code: 'ETIMEDOUT' });
    },
  };
  await assert.rejects(
    () => invokeAdapter({
      adapter,
      provider: { id: 'fake-reserve', adapter_key: 'fake' },
      operation: 'reserveNumber',
      input: {},
      timeoutMs: 10,
    }),
    (error) => {
      assert.equal(error.retryable, true);
      assert.equal(error.safeToRetry, false);
      return true;
    }
  );
});

import { buildProviderReserveInput } from '../api/_lib/activation-repository.js';

test('allocation contract forwards an internal server selection to the synthetic adapter', () => {
  const input = buildProviderReserveInput({
    catalogService: { id: 'svc-example', name: 'Example', pricePaise: 1000, stock: 5 },
    persistedService: { id: 'svc-example', name: 'Example', price_paise: 1000, stock: 5, active: true },
    provider: { id: 'provider-mock', adapter_key: 'synthetic' },
    serverId: 'SERVER-7',
    idempotencyKey: 'alloc-test-1',
  });

  assert.equal(input.serverId, 'server-7');
  assert.equal(input.idempotencyKey, 'alloc-test-1');
  assert.equal(input.pricePaise, 1000);
});

test('synthetic flow issues an internal server before creating an activation', async () => {
  const allocation = await syntheticProvider.reserveNumber({
    id: 'svc-example',
    name: 'Example',
  });
  const serverId = allocation.metadata?.serverId;
  assert.match(serverId, /^server-\d+$/);
  assert.equal(allocation.metadata?.serverSelection, 'issued');
  const slot = Number(allocation.metadata?.slot);
  assert.ok(Number.isInteger(slot));
  assert.ok(slot >= allocation.metadata?.serverStartSlot);
  assert.ok(slot <= allocation.metadata?.serverEndSlot);
});
