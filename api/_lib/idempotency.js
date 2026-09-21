import crypto from 'node:crypto';
import { getPool, withTransaction } from './db.js';

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const TTL_HOURS = 24;

export function validateIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!KEY_PATTERN.test(key)) {
    const error = new Error('A valid Idempotency-Key header is required (8-128 characters).');
    error.code = 'IDEMPOTENCY_KEY_REQUIRED';
    throw error;
  }
  return key;
}

export function hashActivationRequest({ serviceId }) {
  const canonical = JSON.stringify({ serviceId: String(serviceId || '') });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function conflict(message, code = 'IDEMPOTENCY_KEY_REUSED') {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function claimActivationKey(userId, key, requestHash) {
  return withTransaction(async client => {
    const inserted = await client.query(
      `INSERT INTO activation_idempotency
        (user_id,idempotency_key,request_hash,status,expires_at)
       VALUES ($1,$2,$3,'Processing',NOW()+INTERVAL '${TTL_HOURS} hours')
       ON CONFLICT (user_id,idempotency_key) DO NOTHING
       RETURNING *`,
      [userId, key, requestHash]
    );
    if (inserted.rowCount) return { state: 'new', row: inserted.rows[0] };

    const existing = await client.query(
      `SELECT * FROM activation_idempotency
       WHERE user_id=$1 AND idempotency_key=$2
       FOR UPDATE`,
      [userId, key]
    );
    if (!existing.rowCount) throw new Error('Idempotency record disappeared');
    const row = existing.rows[0];
    if (row.request_hash !== requestHash) {
      throw conflict('This Idempotency-Key was already used for a different activation request.');
    }
    if (row.status === 'Completed' && row.response_json) {
      return { state: 'completed', response: row.response_json };
    }
    if (row.status === 'Processing') {
      if (row.activation_id && row.response_json) return { state: 'completed', response: row.response_json };
      return { state: 'processing', row };
    }
    if (row.status === 'Failed') {
      await client.query(
        `UPDATE activation_idempotency
         SET status='Processing', error_code=NULL, error_message=NULL, updated_at=NOW(), expires_at=NOW()+INTERVAL '${TTL_HOURS} hours'
         WHERE user_id=$1 AND idempotency_key=$2`,
        [userId, key]
      );
      return { state: 'retry', row: { ...row, status: 'Processing' } };
    }
    throw conflict('This activation request cannot be retried safely.', 'IDEMPOTENCY_KEY_UNUSABLE');
  });
}

export async function completeActivationKey(client, userId, key, activationId, response) {
  const result = await client.query(
    `UPDATE activation_idempotency
     SET status='Completed', activation_id=$3, response_json=$4::jsonb,
         error_code=NULL, error_message=NULL, updated_at=NOW()
     WHERE user_id=$1 AND idempotency_key=$2
     RETURNING *`,
    [userId, key, activationId, JSON.stringify(response)]
  );
  if (!result.rowCount) throw new Error('Idempotency record not found during completion');
  return result.rows[0];
}

export async function failActivationKey(userId, key, errorCode, errorMessage) {
  const pool = await getPool();
  if (!pool) return;
  await pool.query(
    `UPDATE activation_idempotency
     SET status='Failed', error_code=$3, error_message=$4, updated_at=NOW()
     WHERE user_id=$1 AND idempotency_key=$2 AND status='Processing'`,
    [userId, key, String(errorCode || 'ACTIVATION_FAILED').slice(0,80), String(errorMessage || 'Activation failed').slice(0,500)]
  );
}

export async function markActivationKeyStuckSafe(userId, key, errorMessage) {
  const pool = await getPool();
  if (!pool) return;
  await pool.query(
    `UPDATE activation_idempotency
     SET error_code='PROVIDER_COMPENSATION_PENDING', error_message=$3, updated_at=NOW()
     WHERE user_id=$1 AND idempotency_key=$2 AND status='Processing'`,
    [userId, key, String(errorMessage || 'Provider compensation pending').slice(0,500)]
  );
}


export async function cleanupExpiredActivationIdempotency(limit = 500) {
  const pool = await getPool();
  if (!pool) return 0;
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  const result = await pool.query(
    `WITH expired AS (
       SELECT user_id, idempotency_key
       FROM activation_idempotency
       WHERE expires_at < NOW() AND status IN ('Completed','Failed')
       ORDER BY expires_at ASC
       LIMIT $1
     )
     DELETE FROM activation_idempotency a
     USING expired e
     WHERE a.user_id=e.user_id AND a.idempotency_key=e.idempotency_key`,
    [safeLimit]
  );
  return result.rowCount || 0;
}
