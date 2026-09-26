import crypto from 'node:crypto';
import { createProviderAdapter, normalizeProviderActivation } from './provider.js';
import { asEpoch, countryIso2, normalizeExternalStatus, providerServiceCode, requestJson, requireProviderSecret } from './external-provider-http.js';

const BASE_URL = String(process.env.INBOX9_PVAPINS_BASE_URL || 'https://api.pvapins.com').replace(/\/$/, '');
const API_KEY_ENV = 'INBOX9_PVAPINS_API_KEY';
function key() { return requireProviderSecret('PVAPins', API_KEY_ENV); }
function authHeaders(idempotencyKey = null) { return { 'X-API-Key': key(), ...(idempotencyKey ? { 'Idempotency-Key': String(idempotencyKey) } : {}) }; }
function mapOrder(order, service, createdAt = Date.now()) {
  const status = normalizeExternalStatus(order?.status) || 'Active';
  const expiresAt = asEpoch(order?.expiresAt || (order?.expires_in ? createdAt + Number(order.expires_in) * 1000 : null), createdAt + 20 * 60 * 1000);
  return normalizeProviderActivation({ providerActivationId: order?.id, serviceId: service?.id, serviceName: service?.name, number: order?.phoneNumber, status, otp: order?.otpCode ?? order?.message ?? null, createdAt: asEpoch(order?.createdAt, createdAt), expiresAt, metadata: { provider: 'pvapins', country: countryIso2(service), providerService: providerServiceCode(service), operator: order?.operator ?? null, price: order?.price ?? null, currency: order?.currency ?? 'USD' } });
}
export const pvapinsProvider = createProviderAdapter({
  capabilities: { cancelActivation: false, safeToRetryReserve: false },
  async listServices(service = {}) {
    const apiKey = String(process.env[API_KEY_ENV] || '').trim();
    if (!apiKey) return { provider: 'pvapins', configured: false, services: [] };
    const data = await requestJson(BASE_URL + '/api/v1/services', { headers: authHeaders() });
    return { provider: 'pvapins', configured: true, services: Array.isArray(data?.services) ? data.services : [], country: countryIso2(service) };
  },
  async reserveNumber(service) {
    const idempotencyKey = String(service?.idempotencyKey || crypto.randomUUID());
    const data = await requestJson(BASE_URL + '/api/v1/orders', { method: 'POST', headers: authHeaders(idempotencyKey), body: JSON.stringify({ country: countryIso2(service), service: providerServiceCode(service), ...(service?.providerOperator != null ? { operator: service.providerOperator } : {}) }) });
    return mapOrder(data, service);
  },
  async getActivation(input) {
    const id = String(input?.providerActivationId || input?.activation?.providerActivationId || '').trim();
    if (!id) { const error = new Error('PVAPins activation id is missing'); error.code = 'PROVIDER_ACTIVATION_ID_MISSING'; throw error; }
    const data = await requestJson(BASE_URL + '/api/v1/orders/' + encodeURIComponent(id), { headers: authHeaders() });
    return mapOrder(data, input?.activation || {}, Date.now());
  },
  async cancelActivation() { const error = new Error('PVAPins REST API v1 does not document a cancellation operation'); error.code = 'PROVIDER_UNSUPPORTED_CANCEL'; throw error; },
  async health() {
    const apiKey = String(process.env[API_KEY_ENV] || '').trim();
    if (!apiKey) return { provider: 'pvapins', healthy: false, configured: false };
    await requestJson(BASE_URL + '/api/v1/account', { headers: authHeaders() });
    return { provider: 'pvapins', healthy: true, configured: true, checkedAt: Date.now() };
  },
});