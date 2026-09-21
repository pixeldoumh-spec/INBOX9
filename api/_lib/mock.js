import crypto from 'node:crypto';
import { generateSyntheticOtp, syntheticOtpTiming } from './synthetic-otp.js';
import { getSyntheticServer, getServerForSlot, SYNTHETIC_CAPACITY } from './synthetic-servers.js';

const activations = new Map();
const TTL_MS = 3 * 60 * 1000;

export function makeId(prefix = 'ORD') {
  return `${prefix}-${crypto.randomInt(10000, 100000)}`;
}

export function reserveMock(service) {
  const now = Date.now();
  const requestedServerId = String(service?.serverId || '').trim().toLowerCase();
  const server = requestedServerId ? getSyntheticServer(requestedServerId, SYNTHETIC_CAPACITY) : null;
  if (requestedServerId && !server) {
    const error = new Error('Unknown synthetic server');
    error.code = 'UNKNOWN_SYNTHETIC_SERVER';
    throw error;
  }
  const index = server
    ? crypto.randomInt(server.startSlot, server.endSlot + 1)
    : crypto.randomInt(1, SYNTHETIC_CAPACITY + 1);
  const assignedServer = server || getServerForSlot(index, SYNTHETIC_CAPACITY);
  const providerActivationId = `SYN-LOCAL-${crypto.randomUUID()}`;
  const mockOtpAt = now + syntheticOtpTiming(service.id || service.name, index, providerActivationId);
  const activation = {
    id: makeId(),
    serviceId: service.id,
    service: service.name,
    country: 'IN',
    number: `+91 00000 ${String(index).padStart(5, '0')}`,
    pricePaise: service.pricePaise,
    currency: 'INR',
    status: 'Active',
    otp: null,
    createdAt: now,
    expiresAt: now + TTL_MS,
    mockOtpAt,
    serverId: assignedServer?.id || null,
    providerActivationId,
    metadata: {
      engine: 'synthetic-local',
      slot: index,
      serverId: assignedServer?.id || null,
      serverName: assignedServer?.name || null,
      serverCapacity: assignedServer?.capacity || null
    }
  };
  activations.set(activation.id, activation);
  return activation;
}

export function getMock(id) {
  const item = activations.get(id);
  if (!item) return null;
  transition(item);
  return item;
}

export function cancelMock(id) {
  const item = activations.get(id);
  if (!item) return null;
  transition(item);
  if (item.status === 'Active') {
    item.status = 'Refunded';
    item.refundPaise = item.pricePaise;
  }
  return item;
}

function transition(item) {
  if (item.status === 'Active' && Date.now() >= item.mockOtpAt) {
    item.status = 'Completed';
    const slot = Number(item.metadata?.slot || 1);
    const key = item.serviceId || item.service || 'service';
    item.otp = generateSyntheticOtp(key, slot, item.providerActivationId).replace(/(\d{3})(\d{3})/, '$1 $2');
  } else if (item.status === 'Active' && Date.now() >= item.expiresAt) {
    item.status = 'Expired';
  }
}

export function resetMocks() {
  activations.clear();
}
