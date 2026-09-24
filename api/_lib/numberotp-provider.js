import { createProviderAdapter, normalizeProviderActivation } from './provider.js';
import {
  reserveNumberOtpNumber,
  getNumberOtpActivation,
  numberOtpHealth,
} from './numberotp-public.js';

export const numberOtpProvider = createProviderAdapter({
  capabilities: {
    cancelActivation: false,
    safeToRetryReserve: false,
  },
  async listServices() {
    const health = await numberOtpHealth();
    return { ...health, capacityPerService: null };
  },

  async reserveNumber(service) {
    return normalizeProviderActivation(await reserveNumberOtpNumber(service));
  },

  async getActivation({ activation }) {
    return normalizeProviderActivation(await getNumberOtpActivation(activation));
  },

  async cancelActivation() {
    const error = new Error('NumberOTP cancellation is not enabled because the current public API contract does not document a cancellation endpoint');
    error.code = 'PROVIDER_UNSUPPORTED_CANCEL';
    throw error;
  },

  async health() {
    return numberOtpHealth();
  },
});
