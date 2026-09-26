import crypto from 'node:crypto';
import { createProviderAdapter, normalizeProviderActivation } from './provider.js';
import { generateSyntheticIdentity, generateSyntheticIndianNumber, generateSyntheticOtp, syntheticOtpTiming } from './synthetic-otp.js';
import { SYNTHETIC_CAPACITY, issueSyntheticServer } from './synthetic-servers.js';

const TTL_MS = 25 * 60 * 1000;
const CAPACITY = SYNTHETIC_CAPACITY;

function id() { return `SYN-${crypto.randomUUID()}`; }
function slot(server) {
  return crypto.randomInt(server.startSlot, server.endSlot + 1);
}

export const syntheticProvider = createProviderAdapter({
  capabilities: { cancelActivation: true },
  async listServices() { return { provider: 'synthetic', healthy: true, capacityPerService: CAPACITY }; },
  async reserveNumber(service) {
    const createdAt = Date.now();
    const requestedServerId = String(service?.serverId || service?.syntheticServerId || '').trim();
    const server = issueSyntheticServer({
      requestedServerId,
      capacity: CAPACITY,
    });
    const index = slot(server);
    const providerActivationId = id();
    const serviceKey = service.id || service.name;
    const numberRevealAt = createdAt + 5_000;
    const mockOtpAt = createdAt + syntheticOtpTiming(serviceKey, index, providerActivationId);
    return normalizeProviderActivation({
      providerActivationId,
      serviceId: service.id,
      serviceName: service.name,
      number: generateSyntheticIndianNumber(serviceKey, index, CAPACITY),
      status: 'Active',
      otp: null,
      createdAt,
      expiresAt: createdAt + TTL_MS,
      mockOtpAt,
      metadata: {
        engine: 'synthetic',
        numberRevealAt,
        country: 'IN',
        serviceId: service.id,
        slot: index,
        capacityPerService: CAPACITY,
        serverId: server?.id || null,
        serverName: server?.name || null,
        serverCapacity: server?.capacity || null,
        serverStartSlot: server?.startSlot || null,
        serverEndSlot: server?.endSlot || null,
        serverSelection: requestedServerId ? 'qa-pinned' : 'issued',
        identity: generateSyntheticIdentity(serviceKey, index, CAPACITY)
      },
    });
  },
  async getActivation({ activation }) {
    const now = Date.now();
    if (activation.status !== 'Active') return normalizeProviderActivation(activation);
    if (activation.mockOtpAt && now >= activation.mockOtpAt) {
      const index = Number(activation.metadata?.slot || 1);
      const key = activation.serviceId || activation.metadata?.serviceId || activation.metadata?.service || 'service';
      return normalizeProviderActivation({ ...activation, status: 'Completed', otp: activation.otp || generateSyntheticOtp(key, index, activation.providerActivationId) });
    }
    if (now >= activation.expiresAt) return normalizeProviderActivation({ ...activation, status: 'Expired' });
    return normalizeProviderActivation(activation);
  },
  async cancelActivation({ activation }) {
    if (activation.status !== 'Active') return normalizeProviderActivation(activation);
    return normalizeProviderActivation({ ...activation, status: 'Refunded' });
  },
  async health() { return { provider: 'synthetic', healthy: true, capacityPerService: CAPACITY, checkedAt: Date.now() }; },
});
