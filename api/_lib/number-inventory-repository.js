import crypto from 'node:crypto';
import { getPool, withTransaction } from './db.js';

const MAX_SYNC_NUMBERS = 5000;
const MAX_BODY_LENGTH = 4096;
const SOURCE_KEY_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const INDIA_MOBILE_RE = /^\\+91[6-9][0-9]{9}$/;
const INVENTORY_STATUSES = new Set(['Available', 'Reserved', 'Active', 'Suspended', 'Released']);

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function normalizeSourceKey(value) {
  const source = String(value ?? '').trim().toLowerCase();
  if (!SOURCE_KEY_RE.test(source)) {
    const error = new Error('Invalid number inventory source key');
    error.code = 'INVALID_SOURCE_KEY';
    throw error;
  }
  return source;
}

export function normalizeIndianPhone(value) {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/[\\s().-]/g, '');
  const normalized = digits.startsWith('0091') ? '+91' + digits.slice(4) : digits;
  if (!INDIA_MOBILE_RE.test(normalized)) {
    const error = new Error('Number must be a valid +91 Indian mobile number');
    error.code = 'INVALID_INDIAN_NUMBER';
    throw error;
  }
  return normalized;
}

export function extractOtpCode(body) {
  const text = String(body ?? '').replace(/\\s+/g, ' ').trim();
  if (!text) return null;

  const labeled = text.match(/(?:otp|one[- ]time password|verification(?: code)?|security code|passcode|pin)\\D{0,12}(\\d{4,8})/i);
  if (labeled?.[1]) return labeled[1];

  const candidates = [...text.matchAll(/(?<!\\d)(\\d{4,8})(?!\\d)/g)].map(match => match[1]);
  if (candidates.length === 1) return candidates[0];
  return candidates.find(code => code.length >= 6) || null;
}

function normalizeCapabilities(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function normalizeInventoryStatus(value) {
  const candidate = String(value ?? 'Available').trim();
  return INVENTORY_STATUSES.has(candidate) ? candidate : 'Available';
}

export function normalizeInventoryRecord(input) {
  const providerNumberId = String(
    input?.providerNumberId ?? input?.provider_number_id ?? input?.id ?? ''
  ).trim();
  if (!providerNumberId || providerNumberId.length > 200) {
    const error = new Error('Provider number id is required');
    error.code = 'INVALID_PROVIDER_NUMBER_ID';
    throw error;
  }

  return {
    providerNumberId,
    phoneNumber: normalizeIndianPhone(input?.phoneNumber ?? input?.phone_number ?? input?.number),
    region: input?.region == null ? null : String(input.region).slice(0, 120),
    capabilities: normalizeCapabilities(input?.capabilities),
    status: normalizeInventoryStatus(input?.status),
    metadata: normalizeCapabilities(input?.metadata),
  };
}

export async function syncNumberInventory({ sourceKey, numbers, complete = false }) {
  const source = normalizeSourceKey(sourceKey);
  if (!Array.isArray(numbers) || numbers.length > MAX_SYNC_NUMBERS) {
    const error = new Error(`Inventory sync accepts 1-${MAX_SYNC_NUMBERS} numbers`);
    error.code = 'INVALID_INVENTORY_BATCH';
    throw error;
  }

  const normalized = numbers.map(normalizeInventoryRecord);
  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');

  return withTransaction(async client => {
    const syncedAt = new Date();
    const seenProviderIds = new Set();
    const results = { sourceKey: source, received: normalized.length, inserted: 0, updated: 0, suspendedMissing: 0 };

    for (const number of normalized) {
      if (seenProviderIds.has(number.providerNumberId)) continue;
      seenProviderIds.add(number.providerNumberId);

      const existing = await client.query(
        `SELECT id,status,activation_id
         FROM number_inventory
         WHERE source_key=$1 AND provider_number_id=$2
         FOR UPDATE`,
        [source, number.providerNumberId]
      );

      if (!existing.rowCount) {
        await client.query(
          `INSERT INTO number_inventory
             (id,source_key,provider_number_id,phone_number,country,region,capabilities,status,last_synced_at,metadata)
           VALUES ($1,$2,$3,$4,'IN',$5,$6,$7,$8,$9)`,
          [
            id('NUM'), source, number.providerNumberId, number.phoneNumber, number.region,
            JSON.stringify(number.capabilities), number.status, syncedAt, JSON.stringify(number.metadata),
          ]
        );
        results.inserted += 1;
        continue;
      }

      const row = existing.rows[0];
      const preserveLocalReservation = row.status === 'Reserved' || row.status === 'Active';
      const nextStatus = preserveLocalReservation ? row.status : number.status;
      await client.query(
        `UPDATE number_inventory
            SET phone_number=$3,
                region=$4,
                capabilities=$5,
                status=$6,
                last_synced_at=$7,
                metadata=$8,
                updated_at=NOW()
          WHERE source_key=$1 AND provider_number_id=$2`,
        [
          source, number.providerNumberId, number.phoneNumber, number.region,
          JSON.stringify(number.capabilities), nextStatus, syncedAt, JSON.stringify(number.metadata),
        ]
      );
      results.updated += 1;
    }

    if (complete) {
      const missing = await client.query(
        `UPDATE number_inventory
            SET status='Suspended', updated_at=NOW()
          WHERE source_key=$1
            AND status='Available'
            AND provider_number_id <> ALL($2::text[])
          RETURNING id`,
        [source, [...seenProviderIds]]
      );
      results.suspendedMissing = missing.rowCount;
    }

    return results;
  });
}

export async function getNumberInventorySummary() {
  const pool = await getPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT source_key,
            COUNT(*) FILTER (WHERE status='Available')::int AS available,
            COUNT(*) FILTER (WHERE status='Reserved')::int AS reserved,
            COUNT(*) FILTER (WHERE status='Active')::int AS active,
            COUNT(*) FILTER (WHERE status='Suspended')::int AS suspended,
            COUNT(*) FILTER (WHERE status='Released')::int AS released,
            MAX(last_synced_at) AS last_synced_at
       FROM number_inventory
      GROUP BY source_key
      ORDER BY source_key`
  );
  const sources = result.rows.map(row => ({
    sourceKey: row.source_key,
    available: Number(row.available),
    reserved: Number(row.reserved),
    active: Number(row.active),
    suspended: Number(row.suspended),
    released: Number(row.released),
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).getTime() : null,
  }));
  return {
    healthy: true,
    sourceCount: sources.length,
    availableNumbers: sources.reduce((sum, row) => sum + row.available, 0),
    reservedNumbers: sources.reduce((sum, row) => sum + row.reserved, 0),
    activeNumbers: sources.reduce((sum, row) => sum + row.active, 0),
    suspendedNumbers: sources.reduce((sum, row) => sum + row.suspended, 0),
    lastSyncedAt: sources.reduce((max, row) => Math.max(max, Number(row.lastSyncedAt || 0)), 0) || null,
    sources,
  };
}

export async function ingestInboundSms({
  sourceKey,
  providerMessageId,
  toNumber,
  fromNumber = null,
  body,
  receivedAt = Date.now(),
}) {
  const source = normalizeSourceKey(sourceKey);
  const messageId = String(providerMessageId ?? '').trim();
  if (!messageId || messageId.length > 200) {
    const error = new Error('Provider message id is required');
    error.code = 'INVALID_PROVIDER_MESSAGE_ID';
    throw error;
  }
  const to = normalizeIndianPhone(toNumber);
  const from = fromNumber == null || String(fromNumber).trim() === '' ? null : String(fromNumber).trim().slice(0, 120);
  const text = String(body ?? '').trim();
  if (!text || text.length > MAX_BODY_LENGTH) {
    const error = new Error('Inbound SMS body is required and must be 4096 characters or fewer');
    error.code = 'INVALID_SMS_BODY';
    throw error;
  }
  const timestamp = new Date(Number.isFinite(Number(receivedAt)) ? Number(receivedAt) : Date.now());
  const otp = extractOtpCode(text);

  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');

  return withTransaction(async client => {
    const numberResult = await client.query(
      `SELECT id,status
         FROM number_inventory
        WHERE source_key=$1 AND phone_number=$2
        FOR UPDATE`,
      [source, to]
    );
    if (!numberResult.rowCount) {
      const error = new Error('Inbound SMS target number is not in inventory');
      error.code = 'NUMBER_INVENTORY_NOT_FOUND';
      throw error;
    }

    const inventoryId = numberResult.rows[0].id;
    const messageResult = await client.query(
      `INSERT INTO number_sms_messages
         (id,source_key,number_inventory_id,provider_message_id,from_number,to_number,body,otp_code,received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (source_key,provider_message_id) DO NOTHING
       RETURNING id`,
      [id('SMS'), source, inventoryId, messageId, from, to, text, otp, timestamp]
    );

    if (!messageResult.rowCount) {
      return { accepted: true, duplicate: true, activationId: null, otp };
    }

    await client.query(
      `UPDATE number_inventory
          SET last_message_at=$2, updated_at=NOW()
        WHERE id=$1`,
      [inventoryId, timestamp]
    );

    const activationResult = await client.query(
      `SELECT id
         FROM activations
        WHERE phone_number=$1 AND status='Active'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [to]
    );

    let activationId = null;
    if (activationResult.rowCount && otp) {
      activationId = activationResult.rows[0].id;
      await client.query(
        `UPDATE activations
            SET otp=$2, updated_at=NOW()
          WHERE id=$1 AND status='Active'`,
        [activationId, otp]
      );
    } else if (activationResult.rowCount) {
      activationId = activationResult.rows[0].id;
    }

    return { accepted: true, duplicate: false, activationId, otp };
  });
}

export async function cleanupExpiredNumberMessages(limit = 1000) {
  const pool = await getPool();
  if (!pool) return 0;
  const safeLimit = Math.min(Math.max(Number(limit) || 1000, 1), 5000);
  const result = await pool.query(
    `DELETE FROM number_sms_messages
      WHERE id IN (
        SELECT id FROM number_sms_messages
        WHERE expires_at <= NOW()
        ORDER BY expires_at ASC
        LIMIT $1
      )`,
    [safeLimit]
  );
  return result.rowCount;
}
