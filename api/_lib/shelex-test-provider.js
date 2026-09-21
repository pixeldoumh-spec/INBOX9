import { createProviderAdapter } from './provider.js';
import { listShelexCountries } from './shelex-diagnostics.js';

/**
 * Quarantined diagnostic adapter.
 *
 * Shelex documents an API that aggregates public SMS-testing sources. Those
 * numbers are not exclusive inventory, so INBOX9 deliberately does not expose
 * reserveNumber/getActivation/cancelActivation for paid customer activations.
 */
export const shelexTestProvider = createProviderAdapter({
  async listServices() {
    const countries = await listShelexCountries();
    return {
      provider: 'shelex-test',
      healthy: true,
      countries: Array.isArray(countries) ? countries : [],
      capabilities: {
        discovery: true,
        exclusiveReservation: false,
        customerActivations: false,
      },
    };
  },

  async reserveNumber() {
    const error = new Error('Shelex is diagnostic-only in INBOX9; non-exclusive public numbers cannot be used for paid activations');
    error.code = 'PROVIDER_UNSUPPORTED';
    throw error;
  },

  async getActivation() {
    const error = new Error('Shelex is diagnostic-only in INBOX9; activation polling is disabled');
    error.code = 'PROVIDER_UNSUPPORTED';
    throw error;
  },

  async cancelActivation() {
    const error = new Error('Shelex is diagnostic-only in INBOX9; activation cancellation is disabled');
    error.code = 'PROVIDER_UNSUPPORTED';
    throw error;
  },

  async health() {
    try {
      const countries = await listShelexCountries();
      return {
        provider: 'shelex-test',
        healthy: true,
        diagnosticOnly: true,
        countryCount: Array.isArray(countries) ? countries.length : null,
        capabilities: {
          discovery: true,
          exclusiveReservation: false,
          customerActivations: false,
        },
        checkedAt: Date.now(),
      };
    } catch (error) {
      return {
        provider: 'shelex-test',
        healthy: false,
        diagnosticOnly: true,
        capabilities: {
          discovery: true,
          exclusiveReservation: false,
          customerActivations: false,
        },
        error: String(error?.message || 'Shelex diagnostic check failed').slice(0, 300),
        checkedAt: Date.now(),
      };
    }
  },
});
