export function providerDisabledError(providerName, envName) {
  const error = new Error(providerName + ' provider is not configured');
  error.code = 'PROVIDER_NOT_CONFIGURED';
  error.providerName = providerName;
  error.envName = envName;
  return error;
}

export function requireProviderSecret(providerName, envName) {
  const value = String(process.env[envName] || '').trim();
  if (!value) throw providerDisabledError(providerName, envName);
  return value;
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 8_000, 250), 60_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    return { response, text };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Provider request timed out');
      timeoutError.code = 'PROVIDER_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson(url, options = {}) {
  const { response, text } = await request(url, options);
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    const error = new Error('Provider returned invalid JSON');
    error.code = 'PROVIDER_INVALID_RESPONSE';
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(String(data?.message || data?.error || text || ('HTTP ' + response.status)).slice(0, 500));
    error.code = String(data?.code || data?.error || ('HTTP_' + response.status)).slice(0, 80);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function requestText(url, options = {}) {
  const { response, text } = await request(url, options);
  if (!response.ok) {
    const error = new Error(String(text || ('HTTP ' + response.status)).slice(0, 500));
    error.code = 'HTTP_' + response.status;
    error.status = response.status;
    throw error;
  }
  return text.trim();
}

export function normalizeExternalStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['pending', 'wait', 'waiting', 'active', 'processing'].includes(value)) return 'Active';
  if (['completed', 'complete', 'success', 'successful', 'finished'].includes(value)) return 'Completed';
  if (['expired', 'timeout', 'timed_out'].includes(value)) return 'Expired';
  if (['cancelled', 'canceled', 'refunded'].includes(value)) return 'Cancelled';
  return null;
}

export function asEpoch(value, fallback = Date.now()) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function countryIso2(service) {
  return String(service?.country || 'IN').trim().toUpperCase();
}

export function providerServiceCode(service, field = 'providerServiceCode') {
  const value = String(service?.[field] || service?.provider_service_code || service?.externalServiceCode || service?.name || '').trim();
  if (!value) {
    const error = new Error('Provider service mapping is missing');
    error.code = 'PROVIDER_SERVICE_MAPPING_REQUIRED';
    throw error;
  }
  return value;
}
