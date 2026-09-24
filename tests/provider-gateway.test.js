import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeAdapter, invokeProvider, getProviderGatewayMetrics, providerCapabilities, resetProviderGatewayMetrics } from '../api/_lib/provider-gateway.js';
import { syntheticProvider } from '../api/_lib/synthetic-provider.js';
import { numberOtpProvider } from '../api/_lib/numberotp-provider.js';

test.afterEach(() => resetProviderGatewayMetrics());

test('provider adapters expose explicit gateway capabilities', () => {
  assert.equal(providerCapabilities(syntheticProvider).cancelActivation, true);
  assert.equal(providerCapabilities(numberOtpProvider).cancelActivation, false);
  assert.equal(providerCapabilities(numberOtpProvider).safeToRetryReserve, false);
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
