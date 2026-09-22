export const SYNTHETIC_CAPACITY = 5000;
export const SYNTHETIC_SERVER_COUNT = 11;

function normalizePositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Partition the synthetic pool into deterministic server-sized chunks.
 * The 5,000-slot pool is split contiguously so every synthetic slot belongs
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

export function getSyntheticServer(serverId, capacity = SYNTHETIC_CAPACITY) {
  const key = String(serverId || '').trim().toLowerCase();
  if (!/^server-\d+$/.test(key)) return null;
  return listSyntheticServers(capacity).find((server) => server.id === key) || null;
}

export function getServerForSlot(slot, capacity = SYNTHETIC_CAPACITY) {
  const n = Number(slot);
  if (!Number.isInteger(n) || n < 1 || n > capacity) {
    throw new RangeError(`slot must be an integer between 1 and ${capacity}`);
  }
  return listSyntheticServers(capacity).find((server) => n >= server.startSlot && n <= server.endSlot) || null;
}
