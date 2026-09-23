const BASE_URL = 'https://api.numberotp.com/v1';
export const NUMBEROTP_INDIA_COUNTRY_ID = '22';
const CACHE_TTL_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

let cachedInventory = null;
let cacheExpiresAt = 0;
let inflight = null;

function normalize(value) {
  return String(value ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

async function getJson(path) {
  const response = await fetch(BASE_URL + path, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(payload?.error || `NumberOTP returned HTTP ${response.status}`);
    error.code = payload?.code || 'NUMBEROTP_HTTP_ERROR';
    error.status = response.status;
    throw error;
  }
  return payload;
}

function serviceRows(payload) {
  const rows = payload?.data?.services;
  return Array.isArray(rows) ? rows : [];
}

function priceRows(payload) {
  const country = payload?.data?.[NUMBEROTP_INDIA_COUNTRY_ID] || {};
  return country && typeof country === 'object' ? country : {};
}

async function fetchIndiaInventory() {
  const [servicesPayload, pricesPayload] = await Promise.all([
    getJson('/public/services?country=' + encodeURIComponent(NUMBEROTP_INDIA_COUNTRY_ID)),
    getJson('/public/prices?country=' + encodeURIComponent(NUMBEROTP_INDIA_COUNTRY_ID)),
  ]);

  const priceMap = priceRows(pricesPayload);
  const rows = serviceRows(servicesPayload).map((row) => {
    const code = String(row?.code || '').trim();
    const name = String(row?.name || '').trim();
    if (!code || !name) return null;
    const priced = priceMap[code] || {};
    const available = Number.isFinite(Number(priced.count)) ? Number(priced.count) : Number(row.count || 0);
    const costUsd = Number.isFinite(Number(priced.cost)) ? Number(priced.cost) : null;
    return {
      code,
      name,
      normalizedName: normalize(name),
      available: Math.max(0, Math.trunc(available)),
      costUsd,
    };
  }).filter(Boolean);

  const fetchedAt = Date.now();
  return {
    provider: 'numberotp',
    providerName: 'NumberOTP',
    country: 'IN',
    countryId: NUMBEROTP_INDIA_COUNTRY_ID,
    healthy: true,
    fetchedAt,
    services: rows,
  };
}

export async function getNumberOtpIndiaInventory({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedInventory && now < cacheExpiresAt) return cachedInventory;
  if (inflight) return inflight;

  inflight = fetchIndiaInventory()
    .then((result) => {
      cachedInventory = result;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      return result;
    })
    .finally(() => { inflight = null; });

  return inflight;
}

export function matchNumberOtpService(inventory, service) {
  const target = normalize(service?.name);
  if (!target) return null;
  return inventory?.services?.find((item) => item.normalizedName === target) || null;
}

export async function getNumberOtpAvailability(service, options = {}) {
  try {
    const inventory = await getNumberOtpIndiaInventory(options);
    const match = matchNumberOtpService(inventory, service);
    if (!match) return null;
    return {
      provider: 'numberotp',
      code: match.code,
      available: match.available,
      costUsd: match.costUsd,
      fetchedAt: inventory.fetchedAt,
      source: 'public',
    };
  } catch (error) {
    console.error('numberotp.public_inventory_failed', error);
    return null;
  }
}

export function normalizeNumberOtpActivation(value) {
  const raw = value?.data?.activation || value?.data || value?.activation || value || {};
  const id = raw.id || raw.activation_id || raw.activationId;
  const number = raw.phone_number || raw.phoneNumber || raw.number;
  const status = raw.status || raw.state || 'Active';
  if (!id || !number) {
    const error = new Error('NumberOTP returned an invalid activation');
    error.code = 'NUMBEROTP_INVALID_ACTIVATION';
    throw error;
  }
  return {
    providerActivationId: String(id),
    number: String(number),
    status: String(status),
    otp: raw.otp == null ? null : String(raw.otp),
    createdAt: raw.created_at ? new Date(raw.created_at).getTime() : Date.now(),
    expiresAt: raw.expires_at ? new Date(raw.expires_at).getTime() : Date.now() + 20 * 60 * 1000,
    mockOtpAt: null,
    metadata: {
      engine: 'numberotp',
      country: 'IN',
      countryId: NUMBEROTP_INDIA_COUNTRY_ID,
      serviceCode: raw.service || null,
    },
  };
}

export async function numberOtpRequest(path, options = {}) {
  const key = String(process.env.NUMBEROTP_API_KEY || '').trim();
  if (!key) {
    const error = new Error('NumberOTP API key is not configured');
    error.code = 'NUMBEROTP_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }
  const response = await fetch(BASE_URL + path, {
    ...options,
    headers: {
      accept: 'application/json',
      authorization: 'Bearer ' + key,
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(12_000),
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(payload?.error || `NumberOTP returned HTTP ${response.status}`);
    error.code = payload?.code || 'NUMBEROTP_HTTP_ERROR';
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function reserveNumberOtpNumber(service) {
  const availability = await getNumberOtpAvailability(service);
  if (!availability || availability.available <= 0) {
    const error = new Error('No NumberOTP India numbers are available for this service');
    error.code = 'OUT_OF_STOCK';
    throw error;
  }
  const payload = await numberOtpRequest('/activations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ service: availability.code, country: NUMBEROTP_INDIA_COUNTRY_ID }),
  });
  const normalized = normalizeNumberOtpActivation(payload);
  normalized.metadata.serviceId = service?.id || null;
  normalized.metadata.serviceName = service?.name || null;
  normalized.metadata.costUsd = availability.costUsd;
  return normalized;
}

export async function getNumberOtpActivation(activation) {
  return normalizeNumberOtpActivation(
    await numberOtpRequest('/activations/' + encodeURIComponent(String(activation.providerActivationId)))
  );
}

export async function numberOtpHealth() {
  try {
    const inventory = await getNumberOtpIndiaInventory();
    return {
      provider: 'numberotp',
      healthy: true,
      country: 'IN',
      countryId: NUMBEROTP_INDIA_COUNTRY_ID,
      availableServices: inventory.services.length,
      fetchedAt: inventory.fetchedAt,
      authenticated: Boolean(String(process.env.NUMBEROTP_API_KEY || '').trim()),
      mode: String(process.env.NUMBEROTP_API_KEY || '').trim() ? 'activation-ready' : 'availability-only',
    };
  } catch (error) {
    return {
      provider: 'numberotp',
      healthy: false,
      country: 'IN',
      countryId: NUMBEROTP_INDIA_COUNTRY_ID,
      authenticated: Boolean(String(process.env.NUMBEROTP_API_KEY || '').trim()),
      error: 'NumberOTP availability unavailable',
      checkedAt: Date.now(),
    };
  }
}
