import { getProviderAdapter } from './provider-registry.js';

const DEFAULT_TIMEOUTS_MS = Object.freeze({
  listServices: 8_000,
  reserveNumber: 12_000,
  getActivation: 8_000,
  cancelActivation: 8_000,
  health: 5_000,
});

const OPERATION_METHODS = Object.freeze({
  listServices: 'listServices',
  reserveNumber: 'reserveNumber',
  getActivation: 'getActivation',
  cancelActivation: 'cancelActivation',
  health: 'health',
});

const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const metrics = new Map();

function timeoutFor(operation) {
  const key = 'INBOX9_PROVIDER_' + String(operation)
    .replace(/[A-Z]/g, (c) => '_' + c)
    .toUpperCase() + '_TIMEOUT_MS';
  const fallback = DEFAULT_TIMEOUTS_MS[operation] || 8_000;
  const configured = Number(process.env[key]);
  if (!Number.isFinite(configured) || configured < 250) return fallback;
  return Math.min(Math.trunc(configured), 60_000);
}

function metricKey(provider, operation) {
  return String(provider?.id || provider?.adapter_key || 'unknown') + '::' + operation;
}

function emptyMetric(provider, operation) {
  return {
    providerId: provider?.id || null,
    adapterKey: provider?.adapter_key || provider?.adapterKey || null,
    operation,
    calls: 0,
    successes: 0,
    failures: 0,
    timeouts: 0,
    totalLatencyMs: 0,
    lastLatencyMs: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastErrorCode: null,
  };
}

function record(provider, operation, success, latencyMs, errorCode = null) {
  const key = metricKey(provider, operation);
  const current = metrics.get(key) || emptyMetric(provider, operation);
  current.calls += 1;
  current.totalLatencyMs += latencyMs;
  current.lastLatencyMs = latencyMs;
  if (success) {
    current.successes += 1;
    current.lastSuccessAt = Date.now();
    current.lastErrorCode = null;
  } else {
    current.failures += 1;
    current.lastFailureAt = Date.now();
    current.lastErrorCode = errorCode || 'PROVIDER_OPERATION_FAILED';
    if (errorCode === 'PROVIDER_TIMEOUT') current.timeouts += 1;
  }
  metrics.set(key, current);
}

function safeMessage(error, fallback) {
  return String(error?.message || fallback).slice(0, 500);
}

export function providerCapabilities(adapter) {
  const capabilities = adapter?.capabilities || {};
  return {
    listServices: capabilities.listServices !== false,
    reserveNumber: capabilities.reserveNumber !== false,
    getActivation: capabilities.getActivation !== false,
    cancelActivation: capabilities.cancelActivation === true,
    health: capabilities.health !== false,
    safeToRetryReserve: capabilities.safeToRetryReserve === true,
  };
}

function normalizeProviderError(error, provider, operation) {
  const status = Number(error?.status);
  const code = String(error?.code || '').trim();
  const retryable =
    code === 'PROVIDER_TIMEOUT' ||
    TRANSIENT_CODES.has(code) ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504;

  const normalized = new Error(
    safeMessage(error, 'Provider ' + operation + ' failed')
  );
  normalized.code = code || ('PROVIDER_' + String(operation).toUpperCase() + '_FAILED');
  normalized.providerId = provider?.id || null;
  normalized.adapterKey = provider?.adapter_key || provider?.adapterKey || null;
  normalized.operation = operation;
  normalized.status = Number.isFinite(status) ? status : null;
  normalized.retryable = retryable;
  // Reserve is never treated as safe for automatic retry. A provider timeout
  // can happen after a provider has already allocated the number.
  normalized.safeToRetry = retryable && operation !== 'reserveNumber';
  normalized.originalCode = code || null;
  return normalized;
}

async function withTimeout(promiseFactory, timeoutMs, operation) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(promiseFactory),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(
            'Provider ' + operation + ' timed out after ' + timeoutMs + 'ms'
          );
          error.code = 'PROVIDER_TIMEOUT';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function invokeAdapter({
  adapter,
  provider,
  operation,
  input,
  timeoutMs = timeoutFor(operation),
}) {
  const methodName = OPERATION_METHODS[operation];
  if (!methodName) throw new Error('Unsupported provider operation: ' + operation);
  if (!adapter || typeof adapter[methodName] !== 'function') {
    throw normalizeProviderError(
      Object.assign(new Error('Provider adapter does not implement ' + operation), {
        code: 'PROVIDER_OPERATION_UNSUPPORTED',
      }),
      provider,
      operation
    );
  }

  const capabilities = providerCapabilities(adapter);
  if (operation !== 'health' && capabilities[operation] === false) {
    throw normalizeProviderError(
      Object.assign(new Error('Provider does not support ' + operation), {
        code: operation === 'cancelActivation' ? 'PROVIDER_UNSUPPORTED_CANCEL' : 'PROVIDER_OPERATION_UNSUPPORTED',
      }),
      provider,
      operation
    );
  }

  const startedAt = Date.now();
  try {
    const result = await withTimeout(() => adapter[methodName](input), timeoutMs, operation);
    record(provider, operation, true, Date.now() - startedAt);
    return result;
  } catch (error) {
    const normalized = normalizeProviderError(error, provider, operation);
    record(provider, operation, false, Date.now() - startedAt, normalized.code);
    throw normalized;
  }
}

export async function invokeProvider({ provider, operation, input, timeoutMs }) {
  const adapterKey = provider?.adapter_key || provider?.adapterKey || provider;
  const adapter = getProviderAdapter(adapterKey);
  return invokeAdapter({ adapter, provider, operation, input, timeoutMs });
}

export function getProviderGatewayMetrics(providerId = null) {
  const rows = [...metrics.values()].map((item) => ({
    ...item,
    averageLatencyMs: item.calls ? Number((item.totalLatencyMs / item.calls).toFixed(1)) : 0,
  }));
  return providerId == null
    ? rows
    : rows.filter((item) => String(item.providerId) === String(providerId));
}

export function resetProviderGatewayMetrics() {
  metrics.clear();
}

export function providerGatewayTimeouts() {
  return Object.fromEntries(
    Object.keys(DEFAULT_TIMEOUTS_MS).map((operation) => [operation, timeoutFor(operation)])
  );
}
