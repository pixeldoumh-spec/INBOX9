import { getPool } from './db.js';

export function mapNumberInventory(row) {
  if (!row) return null;
  return {
    id: row.id,
    providerId: row.provider_id,
    providerNumberId: row.provider_number_id,
    phoneNumber: row.phone_number,
    country: row.country,
    region: row.region,
    numberType: row.number_type,
    smsCapable: Boolean(row.sms_capable),
    voiceCapable: Boolean(row.voice_capable),
    status: row.status,
    assignedServiceId: row.assigned_service_id,
    reservedForActivationId: row.reserved_for_activation_id,
    providerMetadata: row.provider_metadata || {},
    lastSyncedAt: row.last_synced_at,
  };
}

export async function upsertProviderNumbers(providerId, numbers) {
  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seen = new Set();
    for (const number of numbers) {
      if (!number?.providerNumberId || !number?.phoneNumber) continue;
      seen.add(String(number.providerNumberId));
      await client.query(
        `INSERT INTO number_inventory
          (id, provider_id, provider_number_id, phone_number, country, region, number_type,
           sms_capable, voice_capable, status, provider_metadata, last_synced_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,NOW(),NOW())
         ON CONFLICT (provider_id, provider_number_id) DO UPDATE SET
           phone_number=EXCLUDED.phone_number,
           country=EXCLUDED.country,
           region=EXCLUDED.region,
           number_type=EXCLUDED.number_type,
           sms_capable=EXCLUDED.sms_capable,
           voice_capable=EXCLUDED.voice_capable,
           provider_metadata=EXCLUDED.provider_metadata,
           last_synced_at=NOW(),
           updated_at=NOW()`,
        [
          `${providerId}:${number.providerNumberId}`,
          providerId,
          String(number.providerNumberId),
          String(number.phoneNumber),
          String(number.country || 'IN'),
          number.region || null,
          number.numberType || null,
          Boolean(number.smsCapable),
          Boolean(number.voiceCapable),
          number.status || 'available',
          JSON.stringify(number.providerMetadata || {}),
        ],
      );
    }
    await client.query('COMMIT');
    return { synced: seen.size };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listAvailableNumbers({ serviceId, limit = 50 } = {}) {
  const pool = await getPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT * FROM number_inventory
     WHERE status='available' AND sms_capable=TRUE AND country='IN'
       AND ($1::text IS NULL OR assigned_service_id IS NULL OR assigned_service_id=$1)
     ORDER BY last_synced_at DESC, id
     LIMIT $2`,
    [serviceId || null, Math.min(Math.max(Number(limit) || 50, 1), 100)],
  );
  return result.rows.map(mapNumberInventory);
}
