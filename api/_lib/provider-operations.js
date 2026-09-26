import crypto from 'node:crypto';
import { getPool, withTransaction } from './db.js';
import { createNotificationTx } from './notification-repository.js';
import { invokeProvider } from './provider-gateway.js';
import { creditRefund, getBalanceForClient } from './wallet-repository.js';
import { releaseSyntheticSlot, shouldRestoreSyntheticStock, shouldRequireSyntheticReservation } from './synthetic-inventory-repository.js';

function id() { return `POP-${crypto.randomUUID()}`; }

function activationPayload(row, { providerStatus = row.status } = {}) {
  return {
    providerActivationId: row.provider_activation_id,
    number: row.phone_number,
    // Provider adapters should see their own lifecycle state. During expiry
    // reconciliation the database state may be ExpirationPending, but the
    // upstream activation is still treated as Active until its provider says
    // otherwise.
    status: providerStatus,
    otp: row.otp,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    mockOtpAt: row.mock_otp_at ? new Date(row.mock_otp_at).getTime() : null,
    metadata: row.provider_metadata || {},
  };
}

export async function beginCancellation(activationId, userId) {
  return withTransaction(async client => {
    const locked = await client.query(
      `SELECT a.*, p.adapter_key FROM activations a
       LEFT JOIN providers p ON p.id=a.provider_id
       WHERE a.id=$1 AND a.user_id=$2
       FOR UPDATE OF a`, [activationId, userId]
    );
    if (!locked.rowCount) return null;
    const row = locked.rows[0];
    if (row.status !== 'Active') return { activation: row, operation: null };
    const existing = await client.query(
      `SELECT * FROM provider_operations WHERE activation_id=$1 AND operation_type='cancel' AND status='Pending' LIMIT 1`, [activationId]
    );
    if (existing.rowCount) {
      return {
        activation: { ...row, status: 'CancellationPending' },
        operation: existing.rows[0],
        providerId: row.provider_id,
        adapterKey: row.adapter_key,
        providerPayload: activationPayload(row),
        alreadyPending: true,
      };
    }
    const operation = await client.query(
      `INSERT INTO provider_operations
       (id,activation_id,operation_type,status,provider_id,provider_activation_id)
       VALUES ($1,$2,'cancel','Pending',$3,$4) RETURNING *`,
      [id(), activationId, row.provider_id, row.provider_activation_id]
    );
    await client.query(`UPDATE activations SET status='CancellationPending',updated_at=NOW() WHERE id=$1`, [activationId]);
    return {
      activation: { ...row, status: 'CancellationPending' },
      operation: operation.rows[0],
      providerId: row.provider_id,
      adapterKey: row.adapter_key,
      providerPayload: activationPayload(row),
    };
  });
}

export async function completeCancellation(operationId, success, errorMessage = null) {
  return withTransaction(async client => {
    const locked = await client.query(`SELECT o.*, a.* FROM provider_operations o JOIN activations a ON a.id=o.activation_id WHERE o.id=$1 FOR UPDATE`, [operationId]);
    if (!locked.rowCount) throw new Error('Provider operation not found');
    const row = locked.rows[0];
    if (row.status !== 'Pending') return { activationId: row.activation_id, status: row.status };
    if (!success) {
      await client.query(`UPDATE provider_operations SET status='Failed', attempts=attempts+1, last_error=$2, updated_at=NOW(), completed_at=NOW() WHERE id=$1`, [operationId, String(errorMessage || 'Provider cancellation failed').slice(0,500)]);
      await client.query(`UPDATE activations SET status='Active',updated_at=NOW() WHERE id=$1 AND status='CancellationPending'`, [row.activation_id]);
      await createNotificationTx(client, {
        userId:row.user_id, kind:'activation', sourceType:'activation', sourceId:row.activation_id, eventKey:'cancel:failed',
        title:'Cancellation could not be completed', body:'The number is still active. You can retry cancellation from Buy.', page:'buy', tone:'warning'
      });
      return { activationId: row.activation_id, status: 'Failed' };
    }
    await client.query(`UPDATE provider_operations SET status='Succeeded', attempts=attempts+1, last_error=NULL, updated_at=NOW(), completed_at=NOW() WHERE id=$1`, [operationId]);
    const updated = await client.query(`UPDATE activations SET status='Refunded',refund_paise=price_paise,updated_at=NOW() WHERE id=$1 AND status='CancellationPending' RETURNING *`, [row.activation_id]);
    if (updated.rowCount) {
      await createNotificationTx(client, {
        userId: row.user_id, kind:'activation', sourceType:'activation', sourceId:row.activation_id, eventKey:'status:Refunded',
        title:'Activation refunded', body:`₹${(Number(row.price_paise)/100).toFixed(2)} has been returned to your wallet after cancellation.`, page:'buy', tone:'success'
      });
      await releaseSyntheticSlot(client, row.activation_id);
      await client.query(`UPDATE services SET stock=stock+1,updated_at=NOW() WHERE id=$1`, [row.service_id]);
      await creditRefund(client, row.user_id, Number(row.price_paise), row.activation_id, `${row.service_name} activation refund`);
    }
    return { activationId: row.activation_id, status: 'Succeeded', activation: updated.rows[0], balancePaise: await getBalanceForClient(client, row.user_id) };
  });
}

export async function reconcilePendingCancellations({ limit = 25 } = {}) {
  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const result = await pool.query(
    `SELECT o.id AS operation_id, o.*, a.*, p.adapter_key
     FROM provider_operations o JOIN activations a ON a.id=o.activation_id
     LEFT JOIN providers p ON p.id=a.provider_id
     WHERE o.operation_type='cancel' AND o.status='Pending'
     ORDER BY o.updated_at ASC LIMIT $1`, [safeLimit]
  );
  const results = [];
  for (const row of result.rows) {
    try {
      await invokeProvider({
        provider: { id: row.provider_id, adapter_key: row.adapter_key },
        operation: 'cancelActivation',
        input: { providerActivationId: row.provider_activation_id, activation: activationPayload(row, { providerStatus: 'Active' }) },
      });
      results.push(await completeCancellation(row.operation_id, true));
    } catch (error) {
      results.push(await completeCancellation(row.operation_id, false, error.message));
    }
  }
  return results;
}

/**
 * Decide what the expiration reconciler should do after an out-of-transaction
 * provider status check. Pure logic is exported for deterministic tests.
 */
export function decideExpirationAction(current, providerState, now = Date.now()) {
  if (!current || !providerState) return 'noop';
  if (current.status !== 'ExpirationPending') return 'noop';
  if (providerState.status === 'Completed') return 'completed';
  if (providerState.status === 'Expired') return 'expired';
  if (providerState.status === 'Active') {
    const expiry = new Date(current.expires_at).getTime();
    return Number.isFinite(expiry) && expiry <= now ? 'cancel-provider' : 'noop';
  }
  return 'unsupported';
}

async function claimExpiringActivations({ limit = 25 } = {}) {
  return withTransaction(async client => {
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const candidates = await client.query(
      `SELECT a.*, p.adapter_key
       FROM activations a
       LEFT JOIN providers p ON p.id=a.provider_id
       WHERE a.expires_at <= NOW()
         AND a.status IN ('Active','ExpirationPending')
         AND NOT EXISTS (
           SELECT 1 FROM provider_operations o
           WHERE o.activation_id=a.id
             AND o.operation_type='status_sync'
             AND o.status='Pending'
         )
       ORDER BY a.expires_at ASC, a.created_at ASC
       LIMIT $1
       FOR UPDATE OF a SKIP LOCKED`, [safeLimit]
    );

    const claimed = [];
    for (const row of candidates.rows) {
      const operation = await client.query(
        `INSERT INTO provider_operations
         (id,activation_id,operation_type,status,provider_id,provider_activation_id)
         VALUES ($1,$2,'status_sync','Pending',$3,$4)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [id(), row.id, row.provider_id, row.provider_activation_id]
      );
      if (!operation.rowCount) continue;
      if (row.status === 'Active') {
        await client.query(
          `UPDATE activations SET status='ExpirationPending', updated_at=NOW()
           WHERE id=$1 AND status='Active'`, [row.id]
        );
      }
      claimed.push({ ...row, status: 'ExpirationPending', operation_id: operation.rows[0].id });
    }
    return claimed;
  });
}

async function finalizeExpirationOperation(operationId, outcome) {
  return withTransaction(async client => {
    const locked = await client.query(
      `SELECT o.*, a.*
       FROM provider_operations o
       JOIN activations a ON a.id=o.activation_id
       WHERE o.id=$1
       FOR UPDATE`, [operationId]
    );
    if (!locked.rowCount) throw new Error('Provider expiration operation not found');
    const row = locked.rows[0];
    if (row.status !== 'Pending') return { activationId: row.activation_id, status: row.status, stale: true };

    if (outcome.kind === 'failed') {
      await client.query(
        `UPDATE provider_operations
         SET status='Failed', attempts=attempts+1, last_error=$2,
             updated_at=NOW(), completed_at=NOW()
         WHERE id=$1`,
        [operationId, String(outcome.errorMessage || 'Expiration reconciliation failed').slice(0,500)]
      );
      // Keep ExpirationPending so a future reconciliation run can claim a new
      // status_sync operation and retry.
      return { activationId: row.activation_id, status: 'Failed', retryable: true };
    }

    await client.query(
      `UPDATE provider_operations
       SET status='Succeeded', attempts=attempts+1, last_error=NULL,
           updated_at=NOW(), completed_at=NOW()
       WHERE id=$1`, [operationId]
    );

    if (row.status !== 'ExpirationPending') {
      return { activationId: row.activation_id, status: 'Succeeded', stale: true };
    }

    if (outcome.kind === 'completed') {
      const updated = await client.query(
        `UPDATE activations
         SET status='Completed', otp=$2, updated_at=NOW()
         WHERE id=$1 AND status='ExpirationPending'
         RETURNING *`, [row.activation_id, outcome.otp ?? row.otp ?? null]
      );
      if (updated.rowCount) {
        const released = await releaseSyntheticSlot(client, row.activation_id);
        if (!released && shouldRequireSyntheticReservation(row.provider_metadata)) {
          throw new Error('Synthetic inventory reservation is missing for completed activation');
        }
        if (shouldRestoreSyntheticStock('Completed')) {
          await client.query(
            'UPDATE services SET stock=stock+1, updated_at=NOW() WHERE id=$1',
            [row.service_id]
          );
        }
      }
      return { activationId: row.activation_id, status: 'Completed', activation: updated.rows[0] };
    }

    const updated = await client.query(
      `UPDATE activations
       SET status='Expired', otp=$2, updated_at=NOW()
       WHERE id=$1 AND status='ExpirationPending'
       RETURNING *`, [row.activation_id, outcome.otp ?? row.otp ?? null]
    );
    if (updated.rowCount) {
      const released = await releaseSyntheticSlot(client, row.activation_id);
      if (!released && shouldRequireSyntheticReservation(row.provider_metadata)) {
        throw new Error('Synthetic inventory reservation is missing for expired activation');
      }
      // Inventory is restored exactly once by the guarded ExpirationPending -> Expired transition.
      if (shouldRestoreSyntheticStock('Expired')) {
        await client.query(
          `UPDATE services SET stock=stock+1, updated_at=NOW()
           WHERE id=$1`, [row.service_id]
        );
      }
    }
    return { activationId: row.activation_id, status: 'Expired', activation: updated.rows[0] };
  });
}

export async function reconcileExpiringActivations({ limit = 25 } = {}) {
  const claimed = await claimExpiringActivations({ limit });
  const results = [];

  for (const row of claimed) {
    let providerState;
    try {
      if (!row.adapter_key || !row.provider_activation_id) {
        throw new Error('Provider configuration is missing for expired activation');
      }
      // Provider I/O happens outside every database transaction.
      providerState = await invokeProvider({
        provider: { id: row.provider_id, adapter_key: row.adapter_key },
        operation: 'getActivation',
        input: {
          providerActivationId: row.provider_activation_id,
          activation: activationPayload(row, { providerStatus: 'Active' }),
        },
      });

      const action = decideExpirationAction(row, providerState);
      if (action === 'completed') {
        results.push(await finalizeExpirationOperation(row.operation_id, {
          kind: 'completed', otp: providerState.otp,
        }));
        continue;
      }
      if (action === 'expired') {
        results.push(await finalizeExpirationOperation(row.operation_id, {
          kind: 'expired', otp: providerState.otp,
        }));
        continue;
      }
      if (action === 'unsupported') {
        results.push(await finalizeExpirationOperation(row.operation_id, {
          kind: 'failed', errorMessage: `Unsupported provider status: ${providerState.status}`,
        }));
        continue;
      }
      if (action === 'cancel-provider') {
        // Re-read briefly before the external call so a terminal state change
        // cannot cause us to release a newly completed activation.
        const pool = await getPool();
        const currentResult = await pool.query(
          `SELECT a.*, p.adapter_key FROM activations a
           LEFT JOIN providers p ON p.id=a.provider_id
           WHERE a.id=$1`, [row.id]
        );
        if (!currentResult.rowCount || currentResult.rows[0].status !== 'ExpirationPending') {
          results.push(await finalizeExpirationOperation(row.operation_id, { kind: 'failed', errorMessage: 'Stale expiration operation; activation changed state before provider release' }));
          continue;
        }
        const current = currentResult.rows[0];
        const currentExpiry = new Date(current.expires_at).getTime();
        if (!Number.isFinite(currentExpiry) || currentExpiry > Date.now()) {
          results.push(await finalizeExpirationOperation(row.operation_id, { kind: 'failed', errorMessage: 'Expiration deadline moved; retry required' }));
          continue;
        }
        // Releasing an expired provider activation is intentionally not a wallet refund.
        await invokeProvider({
          provider: { id: current.provider_id, adapter_key: current.adapter_key },
          operation: 'cancelActivation',
          input: {
            providerActivationId: current.provider_activation_id,
            activation: activationPayload(current, { providerStatus: 'Active' }),
          },
        });
        results.push(await finalizeExpirationOperation(row.operation_id, { kind: 'expired' }));
        continue;
      }

      // Should only happen when the database deadline is no longer reached.
      results.push(await finalizeExpirationOperation(row.operation_id, { kind: 'failed', errorMessage: 'Expiration check produced no actionable state' }));
    } catch (error) {
      results.push(await finalizeExpirationOperation(row.operation_id, {
        kind: 'failed', errorMessage: error.message,
      }));
    }
  }

  return results;
}