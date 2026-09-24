import crypto from 'node:crypto';
import { getPool, withTransaction } from './db.js';
import { recordAuditTx } from './admin-repository.js';

export const MIN_RECHARGE_PAISE = 10000;
export const MAX_RECHARGE_PAISE = 500000;
export const UPI_ID = String(process.env.INBOX9_UPI_ID || '').trim() || null;

export function getUpiId() {
  return UPI_ID;
}

function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }

function mapWallet(row) {
  return { balancePaise: Number(row?.balance_paise || 0), currency: 'INR' };
}

function mapRecharge(row) {
  return {
    id: row.id,
    amountPaise: Number(row.amount_paise),
    utr: row.utr,
    paymentMethod: row.payment_method,
    upiId: row.upi_id,
    status: row.status,
    rejectionReason: row.rejection_reason || null,
    submittedAt: new Date(row.submitted_at).getTime(),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).getTime() : null,
    flaggedAt: row.flagged_at ? new Date(row.flagged_at).getTime() : null,
    flagReason: row.flag_reason || null,
    verifiedAmountPaise: row.verified_amount_paise == null ? null : Number(row.verified_amount_paise),
    verifiedUtr: row.verified_utr || null,
    externalReference: row.external_reference || null,
  };
}

async function ensureWallet(client, userId) {
  await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
}

export function normalizeVerification(verification = {}) {
  const rawAmount = verification.amountPaise;
  const amountPaise = rawAmount == null || rawAmount === '' ? null : Number(rawAmount);
  if (amountPaise != null && (!Number.isInteger(amountPaise) || amountPaise <= 0)) {
    throw new Error('Verified payment amount is invalid');
  }

  const utr = verification.utr == null || verification.utr === '' ? null : String(verification.utr).trim();
  if (utr != null && !/^[A-Za-z0-9._-]{4,64}$/.test(utr)) {
    throw new Error('Verified UTR is invalid');
  }

  const rawExternalReference = verification.externalReference == null
    ? ''
    : String(verification.externalReference).trim().slice(0, 120);
  const externalReference = rawExternalReference || null;

  return { amountPaise, utr, externalReference };
}

export function isDuplicateUtrError(error) {
  return error?.code === 'DUPLICATE_UTR'
    || (error?.code === '23505' && error?.constraint === 'uq_recharge_utr');
}

export async function getWallet(userId) {
  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  await pool.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  const result = await pool.query('SELECT * FROM wallets WHERE user_id=$1', [userId]);
  return mapWallet(result.rows[0]);
}

export async function listLedger(userId, limit = 25) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const result = await pool.query(
    `SELECT * FROM wallet_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [userId, safeLimit]
  );
  return result.rows.map(row => ({
    id: row.id,
    type: row.entry_type,
    amountPaise: Number(row.amount_paise),
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    description: row.description,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

export async function getWalletSummary(userId) {
  const pool = await getPool();
  const [ledger, pending] = await Promise.all([
    pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount_paise ELSE 0 END),0)::bigint AS credit_paise,
         COALESCE(SUM(CASE WHEN entry_type='debit' THEN amount_paise ELSE 0 END),0)::bigint AS debit_paise,
         COUNT(*) FILTER (WHERE entry_type='credit')::int AS credit_count,
         COUNT(*) FILTER (WHERE entry_type='debit')::int AS debit_count
       FROM wallet_ledger WHERE user_id=$1`,
      [userId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount_paise),0)::bigint AS pending_paise,
              COUNT(*)::int AS pending_count
       FROM recharge_requests WHERE user_id=$1 AND status='Pending'`,
      [userId]
    )
  ]);
  return {
    creditPaise: Number(ledger.rows[0]?.credit_paise || 0),
    debitPaise: Number(ledger.rows[0]?.debit_paise || 0),
    creditCount: Number(ledger.rows[0]?.credit_count || 0),
    debitCount: Number(ledger.rows[0]?.debit_count || 0),
    pendingPaise: Number(pending.rows[0]?.pending_paise || 0),
    pendingCount: Number(pending.rows[0]?.pending_count || 0)
  };
}

export async function createRecharge(userId, amountPaise, utr, submissionSessionId = null) {
  if (!UPI_ID) { const error = new Error('UPI recharge is not configured'); error.code = 'UPI_DESTINATION_NOT_CONFIGURED'; throw error; }
  if (!Number.isInteger(amountPaise) || amountPaise < MIN_RECHARGE_PAISE || amountPaise > MAX_RECHARGE_PAISE) {
    throw new Error('Recharge amount must be between ₹100 and ₹5,000');
  }
  const normalizedUtr = String(utr || '').trim();
  if (!/^[A-Za-z0-9._-]{4,64}$/.test(normalizedUtr)) throw new Error('Enter a valid UTR / transaction reference');
  return withTransaction(async client => {
    const existing = await client.query('SELECT id FROM recharge_requests WHERE LOWER(utr)=LOWER($1)', [normalizedUtr]);
    if (existing.rowCount) throw new Error('This UTR has already been submitted');
    let result;
    try {
      result = await client.query(
        `INSERT INTO recharge_requests (id,user_id,amount_paise,utr,payment_method,upi_id,submission_session_id)
         VALUES ($1,$2,$3,$4,'UPI',$5,$6) RETURNING *`,
        [id('RCH'), userId, amountPaise, normalizedUtr, UPI_ID, submissionSessionId || null]
      );
    } catch (error) {
      if (error?.code === '23505' && error?.constraint === 'uq_recharge_utr') {
        const duplicate = new Error('This UTR has already been submitted');
        duplicate.code = 'DUPLICATE_UTR';
        throw duplicate;
      }
      throw error;
    }
    await client.query(
      `INSERT INTO payment_reconciliation_events (id,recharge_id,event_type,actor_user_id,observed_amount_paise,observed_utr,notes)
       VALUES ($1,$2,'submitted',$3,$4,$5,'Customer submitted UPI recharge for review')`,
      [id('PAY'), result.rows[0].id, userId, amountPaise, normalizedUtr]
    );
    return mapRecharge(result.rows[0]);
  });
}

export async function listRecharges(userId, limit = 25) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const result = await pool.query(
    `SELECT * FROM recharge_requests WHERE user_id=$1 ORDER BY submitted_at DESC LIMIT $2`,
    [userId, safeLimit]
  );
  return result.rows.map(mapRecharge);
}

export async function listPendingRecharges(limit = 100) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const result = await pool.query(
    `SELECT r.*, u.email, u.created_at AS user_created_at,
            ss.session_id AS submission_session_id,
            ss.created_at AS submission_session_created_at,
            ss.last_used_at AS submission_session_last_used_at,
            ss.expires_at AS submission_session_expires_at,
            ss.revoked_at AS submission_session_revoked_at,
            COALESCE((
              SELECT COUNT(*)::int
              FROM sessions sa
              WHERE sa.user_id=r.user_id
                AND sa.revoked_at IS NULL
                AND sa.expires_at>NOW()
            ),0)::int AS active_session_count,
            cs.session_id AS current_session_id,
            cs.created_at AS current_session_created_at,
            cs.last_used_at AS current_session_last_used_at,
            COALESCE((
              SELECT jsonb_agg(to_jsonb(history_row) ORDER BY history_row.submitted_at DESC)
              FROM (
                SELECT r2.id, r2.amount_paise, r2.utr, r2.status, r2.submitted_at, r2.reviewed_at
                FROM recharge_requests r2
                WHERE r2.user_id=r.user_id AND r2.id<>r.id
                ORDER BY r2.submitted_at DESC
                LIMIT 5
              ) AS history_row
            ), '[]'::jsonb) AS recent_payment_history
       FROM recharge_requests r
       JOIN users u ON u.id=r.user_id
       LEFT JOIN sessions ss ON ss.session_id=r.submission_session_id
       LEFT JOIN LATERAL (
         SELECT s.session_id, s.created_at, s.last_used_at
         FROM sessions s
         WHERE s.user_id=r.user_id
           AND s.revoked_at IS NULL
           AND s.expires_at>NOW()
         ORDER BY CASE WHEN s.session_id=r.submission_session_id THEN 0 ELSE 1 END,
                  s.last_used_at DESC NULLS LAST,
                  s.created_at DESC
         LIMIT 1
       ) cs ON TRUE
       WHERE r.status='Pending'
       ORDER BY r.submitted_at ASC
       LIMIT $1`, [safeLimit]
  );
  return result.rows.map(row => ({
    ...mapRecharge(row),
    userId: row.user_id,
    email: row.email,
    accountCreatedAt: row.user_created_at ? new Date(row.user_created_at).getTime() : null,
    submissionSessionId: row.submission_session_id || null,
    submissionSession: row.submission_session_id ? {
      id: row.submission_session_id,
      createdAt: row.submission_session_created_at ? new Date(row.submission_session_created_at).getTime() : null,
      lastUsedAt: row.submission_session_last_used_at ? new Date(row.submission_session_last_used_at).getTime() : null,
      expiresAt: row.submission_session_expires_at ? new Date(row.submission_session_expires_at).getTime() : null,
      revokedAt: row.submission_session_revoked_at ? new Date(row.submission_session_revoked_at).getTime() : null,
      active: !row.submission_session_revoked_at && row.submission_session_expires_at && new Date(row.submission_session_expires_at).getTime() > Date.now()
    } : null,
    sessionContext: {
      activeCount: Number(row.active_session_count || 0),
      currentId: row.current_session_id || null,
      currentCreatedAt: row.current_session_created_at ? new Date(row.current_session_created_at).getTime() : null,
      currentLastUsedAt: row.current_session_last_used_at ? new Date(row.current_session_last_used_at).getTime() : null,
      currentMatchesSubmission: Boolean(row.submission_session_id && row.current_session_id === row.submission_session_id)
    },
    recentPayments: Array.isArray(row.recent_payment_history) ? row.recent_payment_history.map(item => ({
      id: item.id,
      amountPaise: Number(item.amount_paise || 0),
      utr: item.utr,
      status: item.status,
      submittedAt: item.submitted_at ? new Date(item.submitted_at).getTime() : null,
      reviewedAt: item.reviewed_at ? new Date(item.reviewed_at).getTime() : null
    })) : []
  }));
}

export async function reviewRecharge(idValue, adminUserId, decision, rejectionReason = '', verification = {}) {
  return withTransaction(async client => {
    const locked = await client.query('SELECT * FROM recharge_requests WHERE id=$1 FOR UPDATE', [idValue]);
    if (!locked.rowCount) throw new Error('Recharge request not found');
    const row = locked.rows[0];
    if (row.status !== 'Pending') throw new Error('Recharge request has already been reviewed');

    if (decision === 'reject') {
      const result = await client.query(
        `UPDATE recharge_requests SET status='Rejected', rejection_reason=$2, reviewed_at=NOW(), reviewed_by=$3
         WHERE id=$1 RETURNING *`, [idValue, String(rejectionReason || 'Payment could not be verified').slice(0, 250), adminUserId]
      );
      await client.query(
        `INSERT INTO payment_reconciliation_events (id,recharge_id,event_type,actor_user_id,observed_amount_paise,observed_utr,external_reference,notes)
         VALUES ($1,$2,'rejected',$3,$4,$5,$6,$7)`,
        [id('PAY'), idValue, adminUserId, verification.amountPaise ?? null, verification.utr ?? null, verification.externalReference ?? null,
          String(rejectionReason || 'Payment could not be verified').slice(0, 500)]
      );
      await recordAuditTx(client, adminUserId, 'recharge.reject', 'recharge', idValue, {
        status: result.rows[0].status, amountPaise: Number(result.rows[0].amount_paise), utr: result.rows[0].utr,
        reason: String(rejectionReason || 'Payment could not be verified').slice(0, 250)
      });
      return mapRecharge(result.rows[0]);
    }

    const normalized = normalizeVerification(verification);
    if (decision === 'approve' && (normalized.amountPaise == null || normalized.utr == null)) {
      throw new Error('Verified payment amount and UTR are required before approval');
    }
    const observedAmount = normalized.amountPaise;
    const observedUtr = normalized.utr;
    if (observedAmount != null && observedAmount !== Number(row.amount_paise)) throw new Error('Verified payment amount does not match the recharge amount');
    if (observedUtr != null && observedUtr.toLowerCase() !== String(row.utr).toLowerCase()) throw new Error('Verified UTR does not match the submitted UTR');

    await ensureWallet(client, row.user_id);
    await client.query('SELECT * FROM wallets WHERE user_id=$1 FOR UPDATE', [row.user_id]);
    const amount = Number(row.amount_paise);
    await client.query(
      `UPDATE wallets SET balance_paise=balance_paise+$2, updated_at=NOW() WHERE user_id=$1`,
      [row.user_id, amount]
    );
    await client.query(
      `INSERT INTO wallet_ledger (id,user_id,entry_type,amount_paise,reference_type,reference_id,description)
       VALUES ($1,$2,'credit',$3,'recharge',$4,$5)`,
      [id('LED'), row.user_id, amount, row.id, `UPI recharge approved • ${row.utr}`]
    );
    const result = await client.query(
      `UPDATE recharge_requests SET status='Approved', reviewed_at=NOW(), reviewed_by=$2,
         verified_amount_paise=$3, verified_utr=$4, external_reference=$5
       WHERE id=$1 RETURNING *`, [idValue, adminUserId, observedAmount, observedUtr, normalized.externalReference]
    );
    await client.query(
      `INSERT INTO payment_reconciliation_events (id,recharge_id,event_type,actor_user_id,observed_amount_paise,observed_utr,external_reference,notes)
       VALUES ($1,$2,'verified',$3,$4,$5,$6,'Payment details verified before wallet credit')`,
      [id('PAY'), idValue, adminUserId, observedAmount, observedUtr, normalized.externalReference]
    );
    await client.query(
      `INSERT INTO payment_reconciliation_events (id,recharge_id,event_type,actor_user_id,observed_amount_paise,observed_utr,external_reference,notes)
       VALUES ($1,$2,'approved',$3,$4,$5,$6,'Wallet credited after payment verification')`,
      [id('PAY'), idValue, adminUserId, observedAmount, observedUtr, normalized.externalReference]
    );
    await recordAuditTx(client, adminUserId, 'recharge.approve', 'recharge', idValue, {
      status: result.rows[0].status, amountPaise: Number(result.rows[0].amount_paise), utr: result.rows[0].utr,
      verifiedAmountPaise: observedAmount, verifiedUtr: observedUtr, externalReference: normalized.externalReference
    });
    return mapRecharge(result.rows[0]);
  });
}

export async function flagRecharge(idValue, adminUserId, reason, verification = {}) {
  const cleanReason = String(reason || '').trim().slice(0, 500);
  if (!cleanReason) throw new Error('A flag reason is required');
  return withTransaction(async client => {
    const locked = await client.query('SELECT * FROM recharge_requests WHERE id=$1 FOR UPDATE', [idValue]);
    if (!locked.rowCount) throw new Error('Recharge request not found');
    const row = locked.rows[0];
    if (row.status !== 'Pending') throw new Error('Only pending recharge requests can be flagged');
    const normalized = normalizeVerification(verification);
    const result = await client.query(
      `UPDATE recharge_requests SET flagged_at=NOW(), flagged_by=$2, flag_reason=$3,
         verified_amount_paise=$4, verified_utr=$5, external_reference=$6
       WHERE id=$1 RETURNING *`,
      [idValue, adminUserId, cleanReason, normalized.amountPaise, normalized.utr, normalized.externalReference]
    );
    await client.query(
      `INSERT INTO payment_reconciliation_events (id,recharge_id,event_type,actor_user_id,observed_amount_paise,observed_utr,external_reference,notes)
       VALUES ($1,$2,'flagged',$3,$4,$5,$6,$7)`,
      [id('PAY'), idValue, adminUserId, normalized.amountPaise, normalized.utr, normalized.externalReference, cleanReason]
    );
    await recordAuditTx(client, adminUserId, 'recharge.flag', 'recharge', idValue, {
      status: result.rows[0].status, amountPaise: Number(result.rows[0].amount_paise), utr: result.rows[0].utr,
      reason: cleanReason, observedAmountPaise: normalized.amountPaise, observedUtr: normalized.utr,
      externalReference: normalized.externalReference
    });
    return mapRecharge(result.rows[0]);
  });
}

export async function getPaymentReconciliationSummary({ from = null, to = null } = {}) {
  const pool = await getPool();
  const params = [];
  const clauses = [];
  if (from) { params.push(new Date(from)); clauses.push(`submitted_at >= $${params.length}`); }
  if (to) { params.push(new Date(to)); clauses.push(`submitted_at < $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount_paise),0)::bigint AS amount_paise,
            COUNT(*) FILTER (WHERE flagged_at IS NOT NULL)::int AS flagged_count
       FROM recharge_requests ${where} GROUP BY status ORDER BY status`, params
  );
  const totals = await pool.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_paise),0)::bigint AS amount_paise,
            COUNT(*) FILTER (WHERE flagged_at IS NOT NULL)::int AS flagged_count
       FROM recharge_requests ${where}`, params
  );
  return { byStatus: result.rows.map(r => ({ status: r.status, count: Number(r.count), amountPaise: Number(r.amount_paise), flaggedCount: Number(r.flagged_count) })), totals: { count: Number(totals.rows[0].count), amountPaise: Number(totals.rows[0].amount_paise), flaggedCount: Number(totals.rows[0].flagged_count) } };
}

export async function listFlaggedRecharges(limit = 100) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const result = await pool.query(
    `SELECT r.*, u.email FROM recharge_requests r JOIN users u ON u.id=r.user_id
      WHERE r.flagged_at IS NOT NULL ORDER BY r.flagged_at DESC LIMIT $1`, [safeLimit]
  );
  return result.rows.map(row => ({ ...mapRecharge(row), userId: row.user_id, email: row.email }));
}

export async function debitForActivation(client, userId, amountPaise, activationId, description) {
  await ensureWallet(client, userId);
  const wallet = await client.query('SELECT balance_paise FROM wallets WHERE user_id=$1 FOR UPDATE', [userId]);
  const balance = Number(wallet.rows[0]?.balance_paise || 0);
  if (balance < amountPaise) {
    const error = new Error('Insufficient wallet balance. Please recharge your account.');
    error.code = 'INSUFFICIENT_BALANCE';
    throw error;
  }
  await client.query('UPDATE wallets SET balance_paise=balance_paise-$2, updated_at=NOW() WHERE user_id=$1', [userId, amountPaise]);
  await client.query(
    `INSERT INTO wallet_ledger (id,user_id,entry_type,amount_paise,reference_type,reference_id,description)
     VALUES ($1,$2,'debit',$3,'activation',$4,$5)`,
    [id('LED'), userId, amountPaise, activationId, description]
  );
}

export async function creditRefund(client, userId, amountPaise, activationId, description) {
  await ensureWallet(client, userId);
  await client.query('UPDATE wallets SET balance_paise=balance_paise+$2, updated_at=NOW() WHERE user_id=$1', [userId, amountPaise]);
  await client.query(
    `INSERT INTO wallet_ledger (id,user_id,entry_type,amount_paise,reference_type,reference_id,description)
     VALUES ($1,$2,'credit',$3,'activation_refund',$4,$5)`,
    [id('LED'), userId, amountPaise, activationId, description]
  );
}

export async function getBalanceForClient(client, userId) {
  const result = await client.query('SELECT balance_paise FROM wallets WHERE user_id=$1', [userId]);
  return Number(result.rows[0]?.balance_paise || 0);
}
