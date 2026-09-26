import crypto from 'node:crypto';
import { getPool } from './db.js';

function makeId() { return crypto.randomUUID(); }

export async function startProviderReconciliationRun(trigger = 'cron') {
  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  const result = await pool.query(
    `INSERT INTO provider_reconciliation_runs (id,trigger,status)
     VALUES ($1,$2,'Running')
     RETURNING *`,
    [makeId(), trigger === 'manual' ? 'manual' : 'cron']
  );
  return result.rows[0];
}

export async function recordProviderReconciliationEvent(runId, event = {}) {
  const pool = await getPool();
  if (!pool) return null;
  const result = await pool.query(
    `INSERT INTO provider_reconciliation_events
      (id,run_id,operation_id,activation_id,provider_id,event_type,outcome,safe_to_retry,error_code,error_message,details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     RETURNING *`,
    [
      makeId(), runId,
      event.operationId || null,
      event.activationId || null,
      event.providerId || null,
      String(event.eventType || 'reconciliation').slice(0,100),
      String(event.outcome || 'unknown').slice(0,100),
      Boolean(event.safeToRetry),
      event.errorCode ? String(event.errorCode).slice(0,80) : null,
      event.errorMessage ? String(event.errorMessage).slice(0,500) : null,
      JSON.stringify(event.details || {}),
    ]
  );
  return result.rows[0];
}

export async function finishProviderReconciliationRun(runId, summary = {}) {
  const pool = await getPool();
  if (!pool) return null;
  const status = summary.status === 'Failed' ? 'Failed' : 'Succeeded';
  const result = await pool.query(
    `UPDATE provider_reconciliation_runs
        SET status=$2, completed_at=NOW(),
            cancellation_processed=$3,
            expiration_processed=$4,
            wallet_reconciliation_processed=$5,
            error_code=$6,
            error_message=$7
      WHERE id=$1
      RETURNING *`,
    [runId, status, Number(summary.cancellationProcessed || 0), Number(summary.expirationProcessed || 0), Number(summary.walletReconciliationProcessed || 0), summary.errorCode || null, summary.errorMessage ? String(summary.errorMessage).slice(0,500) : null]
  );
  return result.rows[0] || null;
}

export async function listProviderReconciliationRuns({ limit = 20 } = {}) {
  const pool = await getPool();
  if (!pool) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const result = await pool.query(
    `SELECT * FROM provider_reconciliation_runs ORDER BY started_at DESC LIMIT $1`, [safeLimit]
  );
  return result.rows;
}

export async function listProviderReconciliationEvents({ limit = 50 } = {}) {
  const pool = await getPool();
  if (!pool) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const result = await pool.query(
    `SELECT * FROM provider_reconciliation_events ORDER BY created_at DESC LIMIT $1`, [safeLimit]
  );
  return result.rows;
}

export async function getProviderReconciliationBacklog({ limit = 100 } = {}) {
  const pool = await getPool();
  if (!pool) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const result = await pool.query(
    `SELECT o.id,o.activation_id,o.operation_type,o.status,o.provider_id,o.provider_activation_id,
            o.attempts,o.last_error,o.created_at,o.updated_at,o.completed_at,
            a.user_id,a.service_id,a.service_name,a.status AS activation_status,a.expires_at,
            p.adapter_key
       FROM provider_operations o
       LEFT JOIN activations a ON a.id=o.activation_id
       LEFT JOIN providers p ON p.id=o.provider_id
      WHERE o.status='Pending'
        AND o.updated_at < NOW() - INTERVAL '10 minutes'
      ORDER BY o.updated_at ASC
      LIMIT $1`, [safeLimit]
  );
  return result.rows;
}
