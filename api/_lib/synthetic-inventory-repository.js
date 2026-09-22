import crypto from 'node:crypto';
import { getPool } from './db.js';
import { getSyntheticServer, listSyntheticServers, SYNTHETIC_CAPACITY } from './synthetic-servers.js';

export const SYNTHETIC_RESERVATION_STATUS = 'Reserved';

export function shouldRestoreSyntheticStock(status) {
  return status === 'Completed' || status === 'Expired';
}

function reservationId() { return `SLOT-${crypto.randomUUID()}`; }

function assertSlot(slot) {
  const value = Number(slot);
  if (!Number.isInteger(value) || value < 1 || value > SYNTHETIC_CAPACITY) {
    const error = new RangeError(`Synthetic slot must be an integer between 1 and ${SYNTHETIC_CAPACITY}`);
    error.code = 'INVALID_SYNTHETIC_SLOT';
    throw error;
  }
  return value;
}

function assertServiceId(serviceId) {
  const value = String(serviceId || '').trim();
  if (!value) throw new Error('Synthetic inventory service id is required');
  return value;
}

function assertActivationId(activationId) {
  const value = String(activationId || '').trim();
  if (!value) throw new Error('Synthetic inventory activation id is required');
  return value;
}

/**
 * Atomically claims one synthetic slot for an activation.
 *
 * The partial unique index in PostgreSQL is the authoritative concurrency gate:
 * only one Reserved row may exist for a given (service_id, slot_index).
 */
export async function claimSyntheticSlot(client, { activationId, serviceId, slot, serverId, reservedAt = null }) {
  const activation = assertActivationId(activationId);
  const service = assertServiceId(serviceId);
  const index = assertSlot(slot);
  const server = getSyntheticServer(serverId, SYNTHETIC_CAPACITY);
  if (!server) {
    const error = new Error(`Unknown synthetic server: ${serverId}`);
    error.code = 'UNKNOWN_SYNTHETIC_SERVER';
    throw error;
  }
  if (index < server.startSlot || index > server.endSlot) {
    const error = new Error('Synthetic slot does not belong to the requested server');
    error.code = 'SYNTHETIC_SLOT_SERVER_MISMATCH';
    throw error;
  }

  const result = await client.query(
    `INSERT INTO synthetic_slot_reservations
       (id,service_id,slot_index,server_id,activation_id,status,reserved_at)
     VALUES ($1,$2,$3,$4,$5,'Reserved',COALESCE($6,NOW()))
     ON CONFLICT (service_id, slot_index) WHERE status='Reserved' DO NOTHING
     RETURNING id,service_id,slot_index,server_id,activation_id,status,reserved_at`,
    [reservationId(), service, index, server.id, activation, reservedAt ? new Date(reservedAt) : null]
  );

  if (!result.rowCount) {
    const error = new Error('Synthetic slot is already reserved');
    error.code = 'SYNTHETIC_SLOT_CONFLICT';
    throw error;
  }
  return result.rows[0];
}

export async function releaseSyntheticSlot(client, activationId) {
  const activation = assertActivationId(activationId);
  const result = await client.query(
    `UPDATE synthetic_slot_reservations
        SET status='Released', released_at=NOW()
      WHERE activation_id=$1 AND status='Reserved'
      RETURNING service_id,slot_index,server_id,activation_id,status,released_at`,
    [activation]
  );
  return result.rows[0] || null;
}

export async function listSyntheticServerStats(serviceId) {
  const service = assertServiceId(serviceId);
  const pool = await getPool();
  if (!pool) return [];

  const counts = await pool.query(
    `SELECT server_id, COUNT(*)::int AS reserved_count
       FROM synthetic_slot_reservations
      WHERE service_id=$1 AND status='Reserved'
      GROUP BY server_id`,
    [service]
  );
  const byServer = new Map(counts.rows.map(row => [row.server_id, Number(row.reserved_count)]));

  return listSyntheticServers(SYNTHETIC_CAPACITY).map(server => ({
    ...server,
    reservedCount: byServer.get(server.id) || 0,
    availableCount: Math.max(0, server.capacity - (byServer.get(server.id) || 0)),
  }));
}
