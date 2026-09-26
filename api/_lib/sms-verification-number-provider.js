import { createProviderAdapter, normalizeProviderActivation } from './provider.js';
import { asEpoch, countryIso2, providerServiceCode, requestJson, requestText, requireProviderSecret } from './external-provider-http.js';

const BASE_URL = String(process.env.INBOX9_SVNUMBER_BASE_URL || 'https://sms-verification-number.com/stubs/handler_api').replace(/\/$/, '');
const API_KEY_ENV = 'INBOX9_SVNUMBER_API_KEY';
function key() { return requireProviderSecret('SMS Verification Number', API_KEY_ENV); }
function query(params) { return new URLSearchParams(params).toString(); }
async function callText(params) { return requestText(BASE_URL + '?' + query({ ...params, api_key: key(), lang: 'en' })); }
async function resolveCountryId(country) {
  const data = await requestJson('https://sms-verification-number.com/stubs/handler_api?' + query({ api_key: key(), action: 'getCountryAndOperators', lang: 'en' }));
  const target = String(country || 'IN').toUpperCase();
  const targetName = target === 'IN' ? 'india' : target.toLowerCase();
  const match = Array.isArray(data) ? data.find((item) => String(item?.name || '').trim().toLowerCase() === targetName) : null;
  if (match?.id != null) return String(match.id);
  const error = new Error('SMS Verification Number country mapping missing for ' + target);
  error.code = 'PROVIDER_COUNTRY_MAPPING_REQUIRED';
  throw error;
}
function mapStatus(text) {
  const value = String(text || '');
  if (value.startsWith('STATUS_OK:')) return { status: 'Completed', otp: value.slice('STATUS_OK:'.length).trim() || null };
  if (value === 'STATUS_CANCEL') return { status: 'Cancelled', otp: null };
  if (value === 'STATUS_WAIT_CODE') return { status: 'Active', otp: null };
  return { status: 'Active', otp: null };
}
function mapActivation(response, service, createdAt) {
  const parts = String(response || '').split(':');
  if (parts[0] !== 'ACCESS_NUMBER' || !parts[1] || !parts[2]) {
    const error = new Error('SMS Verification Number returned an unexpected activation response');
    error.code = 'PROVIDER_INVALID_RESPONSE';
    throw error;
  }
  return normalizeProviderActivation({
    providerActivationId: parts[1], serviceId: service?.id, serviceName: service?.name, number: '+' + parts.slice(2).join(':'),
    status: 'Active', otp: null, createdAt, expiresAt: createdAt + 20 * 60 * 1000,
    metadata: { provider: 'sms-verification-number', country: countryIso2(service), providerService: providerServiceCode(service), operator: service?.providerOperator || 'any' },
  });
}
export const smsVerificationNumberProvider = createProviderAdapter({
  capabilities: { cancelActivation: true, safeToRetryReserve: false },
  async listServices(service = {}) {
    const targetCountry = countryIso2(service);
    const countryId = await resolveCountryId(targetCountry);
    const raw = await callText({ action: 'getServicesAndCostWithStatistics', country: countryId });
    let services;
    try {
      services = raw ? JSON.parse(raw) : [];
    } catch {
      const error = new Error('SMS Verification Number returned an invalid India service catalog');
      error.code = 'PROVIDER_INVALID_RESPONSE';
      throw error;
    }
    if (!Array.isArray(services)) {
      const error = new Error('SMS Verification Number returned an invalid India service catalog');
      error.code = 'PROVIDER_INVALID_RESPONSE';
      throw error;
    }
    return { provider: 'sms-verification-number', configured: true, country: targetCountry, countryId, services };
  },
  async reserveNumber(service) {
    const createdAt = Date.now();
    const country = await resolveCountryId(countryIso2(service));
    const response = await callText({ action: 'getNumber', service: providerServiceCode(service), operator: String(service?.providerOperator || 'any'), country, ...(service?.maxPrice != null ? { maxPrice: String(service.maxPrice) } : {}) });
    return mapActivation(response, service, createdAt);
  },
  async getActivation(input) {
    const id = String(input?.providerActivationId || input?.activation?.providerActivationId || '').trim();
    if (!id) { const error = new Error('SMS Verification Number activation id is missing'); error.code = 'PROVIDER_ACTIVATION_ID_MISSING'; throw error; }
    const text = await callText({ action: 'getStatus', id });
    const result = mapStatus(text);
    const activation = input?.activation || {};
    return normalizeProviderActivation({ ...activation, providerActivationId: id, status: result.status, otp: result.otp, createdAt: asEpoch(activation.createdAt), expiresAt: asEpoch(activation.expiresAt, Date.now() + 20 * 60 * 1000), metadata: activation.metadata || {} });
  },
  async cancelActivation(input) {
    const id = String(input?.providerActivationId || input?.activation?.providerActivationId || '').trim();
    if (!id) { const error = new Error('SMS Verification Number activation id is missing'); error.code = 'PROVIDER_ACTIVATION_ID_MISSING'; throw error; }
    const text = await callText({ action: 'setStatus', id, status: '8' });
    if (text !== 'ACCESS_CANCEL') { const error = new Error('SMS Verification Number cancellation failed: ' + text); error.code = text || 'PROVIDER_CANCEL_FAILED'; throw error; }
    return normalizeProviderActivation({ ...(input?.activation || {}), providerActivationId: id, status: 'Refunded', otp: input?.activation?.otp || null });
  },
  async health() {
    const balance = await callText({ action: 'getBalance' });
    return { provider: 'sms-verification-number', healthy: true, configured: true, balance, checkedAt: Date.now() };
  },
});