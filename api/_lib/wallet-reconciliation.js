import crypto from 'node:crypto';
import { getPool, withTransaction } from './db.js';
import { recordAuditTx } from './admin-repository.js';

function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }

function mapIssue(row) {
  return {
    id: row.id,
    runId: row.run_id,
    userId: row.user_id,
    email: row.email || null,
    recordedBalancePaise: Number(row.recorded_balance_paise),
    ledgerBalancePaise: Number(row.ledger_balance_paise),
    differencePaise: Number(row.difference_paise),
    createdAt: new Date(row.created_at).getTime(),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : null,
  };
}

export async function reconcileWallets({ limit = 10000, adminUserId = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10000, 1), 100000);
  return withTransaction(async client => {
    const runId = id('WALLET-REC');
    await client.query(
      `INSERT INTO wallet_reconciliation_runs (id,status) VALUES ($1,'Mismatch')`, [runId]
    );

    const result = await client.query(
      `SELECT w.user_id, u.email, w.balance_paise AS recorded_balance_paise,
              COALESCE(SUM(CASE WHEN l.entry_type='credit' THEN l.amount_paise ELSE -l.amount_paise END),0)::bigint AS ledger_balance_paise
       FROM wallets w
       JOIN users u ON u.id=w.user_id
       LEFT JOIN wallet_ledger l ON l.user_id=w.user_id
       GROUP BY w.user_id,u.email,w.balance_paise
       ORDER BY w.user_id
       LIMIT $1`, [safeLimit]
    );

    const issues = [];
    for (const row of result.rows) {
      const recorded = Number(row.recorded_balance_paise);
      const ledger = Number(row.ledger_balance_paise);
      if (recorded !== ledger || recorded < 0) {
        const issue = await client.query(
          `INSERT INTO wallet_reconciliation_issues
             (id,run_id,user_id,recorded_balance_paise,ledger_balance_paise,difference_paise)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [id('WALLET-ISSUE'), runId, row.user_id, recorded, ledger, recorded - ledger]
        );
        issues.push(mapIssue({ ...issue.rows[0], email: row.email }));
      }
    }

    const status = issues.length ? 'Mismatch' : 'Passed';
    await client.query(
      `UPDATE wallet_reconciliation_runs
       SET status=$2, wallets_checked=$3, mismatches_found=$4, completed_at=NOW()
       WHERE id=$1`, [runId, status, result.rowCount, issues.length]
    );
    if (adminUserId) {
      await recordAuditTx(client, adminUserId, 'wallet.reconciliation_completed', 'wallet_reconciliation_run', runId, {
        status, walletsChecked: result.rowCount, mismatchesFound: issues.length
      });
    }

    return {
      runId,
      status,
      walletsChecked: result.rowCount,
      mismatchesFound: issues.length,
      issues,
    };
  });
}

export async function getLatestWalletReconciliation() {
  const pool = await getPool();
  const run = await pool.query(`SELECT * FROM wallet_reconciliation_runs ORDER BY started_at DESC LIMIT 1`);
  if (!run.rowCount) return null;
  const issues = await pool.query(
    `SELECT i.*, u.email FROM wallet_reconciliation_issues i
     JOIN users u ON u.id=i.user_id WHERE i.run_id=$1 ORDER BY i.created_at DESC`,
    [run.rows[0].id]
  );
  const r = run.rows[0];
  return {
    runId: r.id,
    status: r.status,
    walletsChecked: Number(r.wallets_checked),
    mismatchesFound: Number(r.mismatches_found),
    startedAt: new Date(r.started_at).getTime(),
    completedAt: r.completed_at ? new Date(r.completed_at).getTime() : null,
    errorMessage: r.error_message || null,
    issues: issues.rows.map(mapIssue),
  };
}

export async function listOpenWalletReconciliationIssues(limit = 100) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const result = await pool.query(
    `SELECT i.*, u.email FROM wallet_reconciliation_issues i
     JOIN users u ON u.id=i.user_id
     WHERE i.resolved_at IS NULL
     ORDER BY i.created_at DESC LIMIT $1`, [safeLimit]
  );
  return result.rows.map(mapIssue);
}


export async function resolveWalletReconciliationIssue(adminUserId, issueId, resolved = true) {
  return withTransaction(async client => {
    const current = await client.query(
      `SELECT i.*, u.email FROM wallet_reconciliation_issues i
       JOIN users u ON u.id=i.user_id
       WHERE i.id=$1 FOR UPDATE`,
      [String(issueId || '').trim()]
    );
    if (!current.rowCount) throw Object.assign(new Error('Reconciliation issue not found'), { statusCode: 404 });
    const row = current.rows[0];
    const next = Boolean(resolved);
    const updated = await client.query(
      'UPDATE wallet_reconciliation_issues SET resolved_at=$2 WHERE id=$1 RETURNING *',
      [row.id, next ? new Date() : null]
    );
    await recordAuditTx(client, adminUserId, next ? 'wallet.reconciliation_issue_resolved' : 'wallet.reconciliation_issue_reopened',
      'wallet_reconciliation_issue', row.id, {
        userId: row.user_id, email: row.email,
        recordedBalancePaise: Number(row.recorded_balance_paise),
        ledgerBalancePaise: Number(row.ledger_balance_paise),
        differencePaise: Number(row.difference_paise)
      });
    return mapIssue({ ...updated.rows[0], email: row.email });
  });
}
