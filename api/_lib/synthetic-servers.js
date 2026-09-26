import crypto from 'node:crypto';

export const SYNTHETIC_CAPACITY = 100;
export const SYNTHETIC_SERVER_COUNT = 11;

function normalizePositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Partition the synthetic pool into deterministic server-sized chunks.
 * The 100-slot pool is split contiguously so every synthetic slot belongs
 * to exactly one server and the final server receives any remainder.
 */
export function listSyntheticServers(capacity = SYNTHETIC_CAPACITY, count = SYNTHETIC_SERVER_COUNT) {
  const cap = normalizePositiveInt(capacity, SYNTHETIC_CAPACITY);
  const serverCount = Math.min(normalizePositiveInt(count, SYNTHETIC_SERVER_COUNT), cap);
  const base = Math.floor(cap / serverCount);
  const remainder = cap % serverCount;

  let cursor = 1;
  return Array.from({ length: serverCount }, (_, index) => {
    const size = base + (index < remainder ? 1 : 0);
    const server = {
      id: `server-${index + 1}`,
      name: `Server ${index + 1}`,
      ordinal: index + 1,
      capacity: size,
      startSlot: cursor,
      endSlot: cursor + size - 1,
    };
    cursor += size;
    return server;
  });
}

/**
 * Issue one synthetic server for a reservation.
 *
 * A caller may pin a valid server only for synthetic QA. Normal synthetic
 * allocations issue a server internally from the slot pool so the customer
 * request does not have to choose an internal server.
 */
export function issueSyntheticServer({ requestedServerId = null, capacity = SYNTHETIC_CAPACITY, count = SYNTHETIC_SERVER_COUNT } = {}) {
  const cap = normalizePositiveInt(capacity, SYNTHETIC_CAPACITY);
  const servers = listSyntheticServers(cap, count);
  const requested = String(requestedServerId || '').trim().toLowerCase();

  if (requested) {
    const server = servers.find((candidate) => candidate.id === requested);
    if (!server) {
      const error = new Error('Unknown synthetic server');
      error.code = 'UNKNOWN_SYNTHETIC_SERVER';
      throw error;
    }
    return server;
  }

  const issuedSlot = crypto.randomInt(1, cap + 1);
  return servers.find((server) => issuedSlot >= server.startSlot && issuedSlot <= server.endSlot) || null;
}

export function getSyntheticServer(serverId, capacity = SYNTHETIC_CAPACITY) {
  const key = String(serverId || '').trim().toLowerCase();
  if (!/^server-d+$/.test(key)) return null;
  return listSyntheticServers(capacity).find((server) => server.id === key) || null;
}

export function getServerForSlot(slot, capacity = SYNTHETIC_CAPACITY) {
  const n = Number(slot);
  if (!Number.isInteger(n) || n < 1 || n > capacity) {
    throw new RangeError(`slot must be an integer between 1 and ${capacity}`);
  }
  return listSyntheticServers(capacity).find((server) => n >= server.startSlot && n <= server.endSlot) || null;
}
