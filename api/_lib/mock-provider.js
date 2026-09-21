import crypto from 'node:crypto';
import { createProviderAdapter, normalizeProviderActivation } from './provider.js';

const TTL_MS = 3 * 60 * 1000;
function id() { return `MOCK-${crypto.randomUUID()}`; }
function number() { return `+91 ${crypto.randomInt(7, 10)}•••• ${crypto.randomInt(1000, 10000)}`; }
function otp() { return String(crypto.randomInt(100000, 1000000)).replace(/(\d{3})(\d{3})/, '$1 $2'); }

export const mockProvider = createProviderAdapter({
  async listServices() { return { provider: 'mock', healthy: true }; },
  async reserveNumber(service) {
    const createdAt = Date.now();
    return normalizeProviderActivation({
      providerActivationId: id(), number: number(), status: 'Active', otp: null,
      createdAt, expiresAt: createdAt + TTL_MS,
      mockOtpAt: createdAt + crypto.randomInt(12000, 28000),
      metadata: { mode: 'mock', country: 'IN', serviceId: service.id },
    });
  },
  async getActivation({ activation }) {
    const now = Date.now();
    if (activation.status !== 'Active') return normalizeProviderActivation(activation);
    if (activation.mockOtpAt && now >= activation.mockOtpAt) {
      return normalizeProviderActivation({ ...activation, status: 'Completed', otp: activation.otp || otp() });
    }
    if (now >= activation.expiresAt) return normalizeProviderActivation({ ...activation, status: 'Expired' });
    return normalizeProviderActivation(activation);
  },
  async cancelActivation({ activation }) {
    if (activation.status !== 'Active') return normalizeProviderActivation(activation);
    return normalizeProviderActivation({ ...activation, status: 'Refunded' });
  },
  async health() { return { provider: 'mock', healthy: true, checkedAt: Date.now() }; },
});
