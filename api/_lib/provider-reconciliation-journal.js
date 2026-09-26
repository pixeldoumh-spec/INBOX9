import crypto from 'node:crypto';
import { getPool } from './db.js';

function id() { return `PRR-${crypto.randomUUID()}`; }

export async function beginProviderReconciliationRun(trigger = 'cron', metadata = {}) {
  const pool = await getPool();
  const runId = id();
  await pool.query(
    `INSERT INTO provider_reconciliation_runs
      (id,trigger,status,metadata)
     VALUES ($1,$2,'Running',$3::jsonb)`,
    [runId, trigger, JSON.stringify(metadata || {})]
  );
  return runId;
}

export async function recordProviderReconciliationEvent(runId, event = {}) {
  if (!runId) return;
  const pool = await getPool();
  await pool.query(
    `INSERT INTO provider_reconciliation_events
      (run_id,operation_id,activation_id,provider_id,action,outcome,retryable,
       provider_status,provider_activation_id,error_code,error_message,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
    [
      runId,
      event.operationId || null,
      event.activationId || null,
      event.providerId || null,
      event.action || 'status_sync',
      event.outcome || 'skipped',
      Boolean(event.retryable),
      event.providerStatus || null,
      event.providerActivationId || null,
      event.errorCode || null,
      event.errorMessage ? String(event.errorMessage).slice(0, 500) : null,
      JSON.stringify(event.metadata || {}),
    ]
  );
}

export async function finishProviderReconciliationRun(runId, status, summary = {}, errorMessage = null) {
  if (!runId) return;
  const pool = await getPool();
  await pool.query(
    `UPDATE provider_reconciliation_runs
        SET status=$2, completed_at=NOW(), processed_count=$3,
            succeeded_count=$4, failed_count=$5, review_count=$6,
            error_message=$7
      WHERE id=$1`,
    [
      runId,
      status,
      Number(summary.processed || 0),
      Number(summary.succeeded || 0),
      Number(summary.failed || 0),
      Number(summary.review || 0),
      errorMessage ? String(errorMessage).slice(0, 500) : null,
    ]
  );
}

export async function findProviderReconciliationOrphans(limit = 100) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const result = await pool.query(
    `SELECT a.id AS activation_id, a.provider_id, a.provider_activation_id,
            a.status, a.service_id, a.service_name, a.phone_number,
            a.created_at, a.updated_at,
            p.adapter_key
       FROM activations a
       LEFT JOIN providers p ON p.id=a.provider_id
      WHERE a.provider_activation_id IS NOT NULL
        AND (a.provider_id IS NULL OR p.id IS NULL OR p.active=false)
        AND a.status IN ('Active','CancellationPending','ExpirationPending')
      ORDER BY a.updated_at ASC
      LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}

export async function getProviderReconciliationMonitor(limit = 50) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 250);
  const [runs, events, orphanResult] = await Promise.all([
    pool.query(`SELECT id,trigger,status,started_at,completed_at,processed_count,
                       succeeded_count,failed_count,review_count,error_message
                  FROM provider_reconciliation_runs
                 ORDER BY started_at DESC LIMIT $1`, [safeLimit]),
    pool.query(`SELECT e.id,e.run_id,e.operation_id,e.activation_id,e.provider_id,
                       e.action,e.outcome,e.retryable,e.provider_status,
                       e.provider_activation_id,e.error_code,e.error_message,e.created_at
                  FROM provider_reconciliation_events e
                 ORDER BY e.created_at DESC LIMIT $1`, [safeLimit]),
    pool.query(`SELECT COUNT(*)::int AS count
                  FROM activations a
                  LEFT JOIN providers p ON p.id=a.provider_id
                 WHERE a.provider_activation_id IS NOT NULL
                   AND (a.provider_id IS NULL OR p.id IS NULL OR p.active=false)
                   AND a.status IN ('Active','CancellationPending','ExpirationPending')`),
  ]);
  return {
    summary: {
      openOrphans: Number(orphanResult.rows[0]?.count || 0),
      runningRuns: runs.rows.filter(row => row.status === 'Running').length,
      failedRuns: runs.rows.filter(row => row.status === 'Failed' || row.status === 'Partial').length,
      recentReviewEvents: events.rows.filter(row => row.outcome === 'needs_review').length,
    },
    runs: runs.rows.map(row => ({
      id: row.id, trigger: row.trigger, status: row.status,
      startedAt: new Date(row.started_at).getTime(),
      completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
      processed: Number(row.processed_count || 0),
      succeeded: Number(row.succeeded_count || 0),
      failed: Number(row.failed_count || 0),
      review: Number(row.review_count || 0),
      errorMessage: row.error_message,
    })),
    events: events.rows.map(row => ({
      id: Number(row.id), runId: row.run_id, operationId: row.operation_id,
      activationId: row.activation_id, providerId: row.provider_id,
      action: row.action, outcome: row.outcome, retryable: Boolean(row.retryable),
      providerStatus: row.provider_status, providerActivationId: row.provider_activation_id,
      errorCode: row.error_code, errorMessage: row.error_message,
      createdAt: new Date(row.created_at).getTime(),
    })),
  };
}
