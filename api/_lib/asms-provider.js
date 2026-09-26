import { createProviderAdapter, normalizeProviderActivation } from './provider.js';
import { asEpoch, providerServiceCode, requestJson, requireProviderSecret } from './external-provider-http.js';

const BASE_URL = String(process.env.INBOX9_ASMS_BASE_URL || 'https://asms.ai').replace(/\/$/, '');
const API_KEY_ENV = 'INBOX9_ASMS_API_KEY';
function key() { return requireProviderSecret('ASMS.ai', API_KEY_ENV); }
function headers() { return { Authorization: 'Bearer ' + key() }; }
function countryCode(service) {
  const raw = String(service?.country || 'IN').trim().toUpperCase();
  const mapText = String(process.env.INBOX9_ASMS_COUNTRY_MAP_JSON || '').trim();
  if (mapText) {
    try { const map = JSON.parse(mapText); if (map && typeof map === 'object' && map[raw]) return String(map[raw]); }
    catch { const error = new Error('Invalid INBOX9_ASMS_COUNTRY_MAP_JSON'); error.code = 'PROVIDER_CONFIG_INVALID'; throw error; }
  }
  return raw.toLowerCase();
}
function mapOrder(data, service, createdAt) {
  if (!data?.activationId || !data?.phoneNumber) { const error = new Error('ASMS.ai returned an invalid OTP order'); error.code = 'PROVIDER_INVALID_RESPONSE'; throw error; }
  return normalizeProviderActivation({
    providerActivationId: data.activationId, serviceId: service?.id, serviceName: service?.name, number: data.phoneNumber, status: 'Active', otp: null,
    createdAt, expiresAt: asEpoch(data.expiresAt, createdAt + 10 * 60 * 1000),
    metadata: { provider: 'asms', country: countryCode(service), providerService: providerServiceCode(service), price: data.price ?? null, currency: data.currency ?? 'USD' },
  });
}
export const asmsProvider = createProviderAdapter({
  capabilities: { cancelActivation: false, safeToRetryReserve: false },
  async listServices(service = {}) {
    const country = countryCode(service);
    const data = await requestJson(BASE_URL + '/api/v1/otp/services?country=' + encodeURIComponent(country), { headers: headers() });
    return { provider: 'asms', configured: true, country: String(country).toUpperCase(), services: Array.isArray(data?.services) ? data.services : [] };
  },
  async reserveNumber(service) {
    const createdAt = Date.now();
    const data = await requestJson(BASE_URL + '/api/v1/otp/order', { method: 'POST', headers: headers(), body: JSON.stringify({ country: countryCode(service), service: providerServiceCode(service) }) });
    return mapOrder(data, service, createdAt);
  },
  async getActivation(input) {
    const id = String(input?.providerActivationId || input?.activation?.providerActivationId || '').trim();
    if (!id) { const error = new Error('ASMS.ai activation id is missing'); error.code = 'PROVIDER_ACTIVATION_ID_MISSING'; throw error; }
    const data = await requestJson(BASE_URL + '/api/v1/otp/sms?id=' + encodeURIComponent(id), { headers: headers() });
    const activation = input?.activation || {};
    const code = data?.sms?.code || null;
    return normalizeProviderActivation({ ...activation, providerActivationId: id, status: code ? 'Completed' : 'Active', otp: code, createdAt: asEpoch(activation.createdAt), expiresAt: asEpoch(activation.expiresAt, Date.now() + 10 * 60 * 1000), metadata: activation.metadata || {} });
  },
  async cancelActivation() { const error = new Error('ASMS.ai unfilled orders auto-refund; cancellation is intentionally disabled in this adapter'); error.code = 'PROVIDER_UNSUPPORTED_CANCEL'; throw error; },
  async health() {
    const data = await requestJson(BASE_URL + '/api/v1/balance', { headers: headers() });
    return { provider: 'asms', healthy: true, configured: true, balance: data?.balance ?? null, currency: data?.currency ?? null, checkedAt: Date.now() };
  },
});