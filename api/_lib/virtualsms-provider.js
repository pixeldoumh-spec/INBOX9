import { createProviderAdapter, normalizeProviderActivation } from './provider.js';

const DEFAULT_BASE_URL = 'https://virtualsms.io';
const DEFAULT_TTL_MS = 20 * 60 * 1000;

function baseUrl() {
  return String(process.env.VIRTUALSMS_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}
function apiKey() {
  const value = String(process.env.VIRTUALSMS_API_KEY || '').trim();
  if (!value) {
    const error = new Error('VirtualSMS API key is not configured');
    error.code = 'PROVIDER_CREDENTIALS_MISSING';
    throw error;
  }
  return value;
}
function resellerAuthorized() {
  return String(process.env.VIRTUALSMS_RESELLER_AUTHORIZED || '').trim().toLowerCase() === 'true';
}
function canaryEnabled() {
  return String(process.env.VIRTUALSMS_CANARY_ENABLED || '').trim().toLowerCase() === 'true';
}
function serviceMap() {
  const raw = String(process.env.VIRTUALSMS_SERVICE_MAP_JSON || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    const error = new Error('VIRTUALSMS_SERVICE_MAP_JSON is not valid JSON');
    error.code = 'PROVIDER_CONFIGURATION_INVALID';
    throw error;
  }
}
function allowedServiceIds() {
  const raw = String(process.env.VIRTUALSMS_ALLOWED_SERVICE_IDS_JSON || '').trim();
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error();
    return new Set(parsed.map((value) => String(value).trim()).filter(Boolean));
  } catch {
    const error = new Error('VIRTUALSMS_ALLOWED_SERVICE_IDS_JSON is not a JSON array');
    error.code = 'PROVIDER_CONFIGURATION_INVALID';
    throw error;
  }
}
function serviceCodeFor(service) {
  const map = serviceMap();
  const keys = [service?.id, service?.name].map((value) => String(value || '').trim()).filter(Boolean);
  const code = keys.map((key) => map[key]).find((value) => String(value || '').trim());
  if (!code) {
    const error = new Error('VirtualSMS service mapping is not configured for this service');
    error.code = 'VIRTUALSMS_SERVICE_MAPPING_MISSING';
    throw error;
  }
  return String(code).trim();
}
export function validateVirtualSmsPurchaseConfig({ apiKeyValue, resellerAuthorizedValue, canaryEnabledValue, allowedServiceIds: allowlistedIds, serviceId } = {}) {
  if (!String(apiKeyValue || '').trim()) {
    const error = new Error('VirtualSMS API key is not configured');
    error.code = 'PROVIDER_CREDENTIALS_MISSING';
    throw error;
  }
  if (String(resellerAuthorizedValue || '').trim().toLowerCase() !== 'true') {
    const error = new Error('VirtualSMS customer resale is not enabled until written provider authorization is recorded');
    error.code = 'PROVIDER_RESELLER_AUTHORIZATION_REQUIRED';
    throw error;
  }
  if (String(canaryEnabledValue || '').trim().toLowerCase() !== 'true') {
    const error = new Error('VirtualSMS canary mode is disabled');
    error.code = 'PROVIDER_CANARY_DISABLED';
    throw error;
  }
  const allowed = allowlistedIds instanceof Set ? allowlistedIds : new Set();
  if (!allowed.has(String(serviceId || '').trim())) {
    const error = new Error('VirtualSMS service is not enabled for the canary allowlist');
    error.code = 'VIRTUALSMS_SERVICE_NOT_ALLOWLISTED';
    throw error;
  }
}

function assertPurchaseEnabled(service) {
  validateVirtualSmsPurchaseConfig({
    apiKeyValue: process.env.VIRTUALSMS_API_KEY,
    resellerAuthorizedValue: process.env.VIRTUALSMS_RESELLER_AUTHORIZED,
    canaryEnabledValue: process.env.VIRTUALSMS_CANARY_ENABLED,
    allowedServiceIds: allowedServiceIds(),
    serviceId: service?.id,
  });
}
function parseTime(value, fallback) {
  const parsed = value == null ? NaN : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}
function normalizeStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['completed','complete','success','succeeded'].includes(raw)) return 'Completed';
  if (['expired','timeout','timed_out'].includes(raw)) return 'Expired';
  if (['cancelled','canceled','refunded','released'].includes(raw)) return 'Refunded';
  return 'Active';
}
function extractMessage(order) {
  const messages = Array.isArray(order?.messages) ? order.messages : [];
  for (const item of messages) {
    const content = String(item?.content || item?.text || '').trim();
    if (!content) continue;
    const six = content.match(/\b(\d{6})\b/);
    if (six) return six[1];
    const generic = content.match(/\b(\d{4,8})\b/);
    if (generic) return generic[1];
  }
  return null;
}
async function request(path, { method='GET', body=null, idempotencyKey=null } = {}) {
  const headers = { Accept:'application/json', 'X-API-Key': apiKey() };
  if (body != null) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey);
  const response = await fetch(baseUrl() + path, {
    method, headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw:text }; }
  if (!response.ok || payload?.success === false) {
    const error = new Error(String(payload?.error || payload?.message || 'VirtualSMS request failed'));
    error.status = response.status;
    error.code = String(payload?.code || ('VIRTUALSMS_HTTP_' + response.status));
    throw error;
  }
  return payload;
}
export function normalizeVirtualSmsOrder(order, existing={}) {
  const now = Date.now();
  const number = order?.phone_number || order?.phoneNumber || order?.number || existing.number;
  const providerActivationId = order?.order_id || order?.orderId || order?.id || existing.providerActivationId;
  if (!providerActivationId || !number) {
    const error = new Error('VirtualSMS returned an incomplete order');
    error.code = 'PROVIDER_INVALID_RESPONSE';
    throw error;
  }
  const createdAt = parseTime(order?.created_at || order?.createdAt, existing.createdAt || now);
  const expiresAt = parseTime(order?.expires_at || order?.expiresAt, existing.expiresAt || createdAt + Number(process.env.VIRTUALSMS_DEFAULT_TTL_MS || DEFAULT_TTL_MS));
  const status = normalizeStatus(order?.status || existing.status);
  const otp = extractMessage(order) || existing.otp || null;
  return normalizeProviderActivation({
    providerActivationId:String(providerActivationId),
    number:String(number),
    status,
    otp,
    createdAt,
    expiresAt,
    metadata:{
      provider:'virtualsms',
      country:'IN',
      serviceCode:order?.service || order?.service_code || existing.metadata?.serviceCode || null,
      priceUsd:order?.price ?? existing.metadata?.priceUsd ?? null,
    },
  });
}
export const virtualSmsProvider = createProviderAdapter({
  capabilities:{ cancelActivation:true, safeToRetryReserve:false },
  async listServices() {
    const result = await request('/api/v1/customer/services');
    return { provider:'virtualsms', healthy:true, services:Array.isArray(result?.services)?result.services:(Array.isArray(result?.data)?result.data:[]), checkedAt:Date.now() };
  },
  async reserveNumber(service) {
    assertPurchaseEnabled(service);
    const result = await request('/api/v1/customer/purchase', {
      method:'POST',
      body:{service:serviceCodeFor(service),country:'IN'},
      idempotencyKey:service?.idempotencyKey || null,
    });
    return normalizeVirtualSmsOrder(result?.order || result);
  },
  async getActivation({providerActivationId,activation}) {
    const result = await request('/api/v1/customer/order/' + encodeURIComponent(providerActivationId));
    return normalizeVirtualSmsOrder(result?.order || result, {
      providerActivationId,
      number:activation?.number,
      createdAt:activation?.createdAt,
      expiresAt:activation?.expiresAt,
      status:activation?.status,
      otp:activation?.otp,
      metadata:activation?.metadata || {},
    });
  },
  async cancelActivation({providerActivationId,activation}) {
    await request('/api/v1/customer/cancel/' + encodeURIComponent(providerActivationId), {method:'POST'});
    return normalizeProviderActivation({
      providerActivationId,
      number:activation?.number,
      status:'Refunded',
      otp:activation?.otp || null,
      createdAt:activation?.createdAt || Date.now(),
      expiresAt:activation?.expiresAt || Date.now()+DEFAULT_TTL_MS,
      metadata:{provider:'virtualsms',country:'IN'},
    });
  },
  async health() {
    try {
      const [balance,countries] = await Promise.all([
        request('/api/v1/customer/balance'),
        request('/api/v1/customer/countries'),
      ]);
      const list = Array.isArray(countries?.countries)?countries.countries:(Array.isArray(countries?.data)?countries.data:[]);
      const india = list.find((item) => {
        const code=String(item?.iso || item?.code || item?.country || '').trim().toUpperCase();
        return code==='IN' || code==='INDIA';
      });
      return {
        provider:'virtualsms',
        healthy:true,
        purchaseEnabled:resellerAuthorized() && canaryEnabled(),
        indiaListed:Boolean(india),
        balanceUsd:balance?.balance ?? balance?.data?.balance ?? null,
        checkedAt:Date.now(),
      };
    } catch (error) {
      return {
        provider:'virtualsms',
        healthy:false,
        purchaseEnabled:resellerAuthorized() && canaryEnabled(),
        error:'Provider health check failed',
        errorCode:error.code || 'PROVIDER_HEALTH_FAILED',
        status:Number.isFinite(Number(error.status)) ? Number(error.status) : null,
        checkedAt:Date.now(),
      };
    }
  },
});
