import crypto from 'node:crypto';
import { createProviderAdapter, normalizeProviderActivation } from './provider.js';
import { generateSyntheticIdentity, generateSyntheticOtp, syntheticOtpTiming } from './synthetic-otp.js';
import { SYNTHETIC_CAPACITY, getSyntheticServer, getServerForSlot } from './synthetic-servers.js';

const TTL_MS = 3 * 60 * 1000;
const CAPACITY = SYNTHETIC_CAPACITY;

function id() { return `SYN-${crypto.randomUUID()}`; }
function slot(server) {
  if (!server) return crypto.randomInt(1, CAPACITY + 1);
  return crypto.randomInt(server.startSlot, server.endSlot + 1);
}
function syntheticNumber(index) { return `+91 00000 ${String(index).padStart(5, '0')}`; }

export const syntheticProvider = createProviderAdapter({
  async listServices() { return { provider: 'synthetic', healthy: true, capacityPerService: CAPACITY }; },
  async reserveNumber(service) {
    const createdAt = Date.now();
    const requestedServerId = String(service?.serverId || service?.syntheticServerId || '').trim();
    const server = requestedServerId ? getSyntheticServer(requestedServerId, CAPACITY) : null;
    if (requestedServerId && !server) {
      const error = new Error('Unknown synthetic server');
      error.code = 'UNKNOWN_SYNTHETIC_SERVER';
      throw error;
    }
    const index = slot(server);
    const assignedServer = server || getServerForSlot(index, CAPACITY);
    const providerActivationId = id();
    const mockOtpAt = createdAt + syntheticOtpTiming(service.id || service.name, index, providerActivationId);
    return normalizeProviderActivation({
      providerActivationId, number: syntheticNumber(index), status: 'Active', otp: null,
      createdAt, expiresAt: createdAt + TTL_MS, mockOtpAt,
      metadata: { engine: 'synthetic', country: 'IN', serviceId: service.id, slot: index, capacityPerService: CAPACITY,
        serverId: assignedServer?.id || null, serverName: assignedServer?.name || null, serverCapacity: assignedServer?.capacity || null,
        serverStartSlot: assignedServer?.startSlot || null, serverEndSlot: assignedServer?.endSlot || null,
        identity: generateSyntheticIdentity(service.id || service.name, index, CAPACITY) },
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
