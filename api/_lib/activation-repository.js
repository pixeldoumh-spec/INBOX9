import crypto from 'node:crypto';
import { getPool, withTransaction } from './db.js';
import { getProviderAdapter } from './provider-registry.js';
import { beginCancellation, completeCancellation } from './provider-operations.js';
import { debitForActivation, getBalanceForClient } from './wallet-repository.js';
import { completeActivationKey, markActivationKeyStuckSafe } from './idempotency.js';

const TTL_MS = 3 * 60 * 1000;

function mapActivation(row) {
  if (!row) return null;
  return {
    id: row.id,
    serviceId: row.service_id,
    service: row.service_name,
    country: row.country,
    number: row.phone_number,
    pricePaise: row.price_paise,
    currency: row.currency,
    status: row.status,
    otp: row.otp,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    ...(row.refund_paise == null ? {} : { refundPaise: row.refund_paise }),
    ...(row.provider_id ? { providerId: row.provider_id } : {}),
    ...(row.provider_metadata?.serverId ? { serverId: row.provider_metadata.serverId } : {}),
  };
}

function makeId() {
  return `ORD-${crypto.randomUUID()}`;
}


export async function createActivation(service, userId, idempotency = null, options = {}) {
  // Provider reservation happens outside the DB transaction so network calls do not
  // hold database locks. The transaction re-reads the service row and uses that
  // authoritative snapshot for price, currency, availability, country, and stock.
  // If anything fails after reservation, provider cancellation is attempted as
  // compensation.
  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  let reserved = null;
  let provider = null;
  try {
    const latestService = await pool.query(
      `SELECT id,name,category,currency,price_paise,country,availability,stock,active
       FROM services WHERE id=$1`,
      [service.id]
    );
    if (!latestService.rowCount || !latestService.rows[0].active) {
      const e = new Error('Service is unavailable'); e.code = 'SERVICE_UNAVAILABLE'; throw e;
    }
    const providerRoute = await pool.query(
      `SELECT p.id,p.name,p.adapter_key,p.priority
       FROM service_provider_routes r JOIN providers p ON p.id=r.provider_id
       WHERE r.service_id=$1 AND r.active=TRUE AND p.active=TRUE
       ORDER BY r.priority ASC,p.priority ASC,p.id ASC LIMIT 1`, [service.id]
    );
    if (!providerRoute.rowCount) { const e = new Error('No active provider is configured for this service'); e.code = 'NO_PROVIDER'; throw e; }
    provider = providerRoute.rows[0];
    const adapter = getProviderAdapter(provider.adapter_key);
    reserved = await adapter.reserveNumber({
      ...service,
      ...latestService.rows[0],
      pricePaise: Number(latestService.rows[0].price_paise),
      stock: Number(latestService.rows[0].stock),
      active: Boolean(latestService.rows[0].active),
      serverId: options.serverId || null,
    });

    try {
      return await withTransaction(async (client) => {
        const serviceRow = await client.query(
          `SELECT id,name,category,currency,price_paise,country,availability,stock,active
           FROM services WHERE id=$1 FOR UPDATE`,
          [service.id]
        );
        if (!serviceRow.rowCount || !serviceRow.rows[0].active) {
          const e = new Error('Service is unavailable'); e.code = 'SERVICE_UNAVAILABLE'; throw e;
        }
        const dbService = serviceRow.rows[0];
        if (Number(dbService.stock) <= 0) {
          const e = new Error('This service is currently out of stock'); e.code = 'OUT_OF_STOCK'; throw e;
        }
        const now = new Date();
        const expiresAt = new Date(reserved.expiresAt || now.getTime() + TTL_MS);
        const id = `ORD-${crypto.randomUUID()}`;
        const pricePaise = Number(dbService.price_paise);
        const serviceName = dbService.name;
        const currency = dbService.currency || 'INR';
        const country = dbService.country || 'IN';
        if (country !== 'IN' || currency !== 'INR') {
          const e = new Error('Only India / INR services are supported'); e.code = 'SERVICE_UNAVAILABLE'; throw e;
        }
        await debitForActivation(client, userId, pricePaise, id, `${serviceName} activation`);
        await client.query(`UPDATE services SET stock=stock-1,updated_at=NOW() WHERE id=$1`, [service.id]);
        const result = await client.query(
          `INSERT INTO activations
            (id,user_id,service_id,service_name,country,phone_number,price_paise,currency,status,otp,created_at,expires_at,mock_otp_at,provider_id,provider_activation_id,provider_metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [id,userId,service.id,serviceName,country,reserved.number,pricePaise,currency,
           reserved.status || 'Active',reserved.otp,now,expiresAt,
           reserved.mockOtpAt ? new Date(reserved.mockOtpAt) : null,provider.id,reserved.providerActivationId,JSON.stringify(reserved.metadata || {})]
        );
        const activation = mapActivation(result.rows[0]);
        const balancePaise = await getBalanceForClient(client, userId);
        if (idempotency?.idempotencyKey) {
          await completeActivationKey(client, userId, idempotency.idempotencyKey, activation.id, { ...activation, walletBalancePaise: balancePaise });
        }
        return { activation, balancePaise };
      });
    } catch (error) {
      let compensated = false;
      try {
        await adapter.cancelActivation({ providerActivationId: reserved.providerActivationId, activation: reserved });
        compensated = true;
      } catch {}
      if (idempotency?.idempotencyKey) {
        if (compensated) {
          const poolForFailure = await getPool();
          if (poolForFailure) {
            await poolForFailure.query(
              `UPDATE activation_idempotency SET status='Failed', error_code=$3, error_message=$4, updated_at=NOW() WHERE user_id=$1 AND idempotency_key=$2 AND status='Processing'`,
              [userId, idempotency.idempotencyKey, String(error.code || 'ACTIVATION_FAILED').slice(0,80), String(error.message || 'Activation failed').slice(0,500)]
            );
          }
        } else {
          await markActivationKeyStuckSafe(userId, idempotency.idempotencyKey, 'Provider compensation failed; manual/reconciliation action is required before retrying.');
        }
      }
      throw error;
    }
  } catch (error) {
    if (error.code === 'INSUFFICIENT_BALANCE' || error.code === 'OUT_OF_STOCK' || error.code === 'NO_PROVIDER' || error.code === 'SERVICE_UNAVAILABLE') throw error;
    throw error;
  }
}

export function shouldApplyProviderState(current, providerState) {
  if (!current || !providerState) return false;
  if (current.status !== 'Active') return false;
  const allowed = new Set(['Active', 'Completed', 'Expired']);
  if (!allowed.has(providerState.status)) return false;
  return current.status !== providerState.status || current.otp !== providerState.otp;
}

function providerActivationPayload(row) {
  return {
    providerActivationId: row.provider_activation_id,
    number: row.phone_number,
    status: row.status,
    otp: row.otp,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    mockOtpAt: row.mock_otp_at ? new Date(row.mock_otp_at).getTime() : null,
    metadata: row.provider_metadata || {},
  };
}

export async function getActivation(id, userId) {
  const pool = await getPool();
  if (!pool) return null;

  // Phase 1: read a snapshot without a transaction/row lock.
  const snapshotResult = await pool.query(
    `SELECT a.*,p.adapter_key
     FROM activations a
     LEFT JOIN providers p ON p.id=a.provider_id
     WHERE a.id=$1 AND a.user_id=$2`,
    [id, userId]
  );
  if (!snapshotResult.rowCount) return null;

  const snapshot = snapshotResult.rows[0];
  if (!snapshot.provider_id || !snapshot.provider_activation_id || snapshot.status !== 'Active') {
    return mapActivation(snapshot);
  }

  let providerState;
  try {
    const adapter = getProviderAdapter(snapshot.adapter_key);
    // Provider I/O intentionally occurs outside any open database transaction.
    providerState = await adapter.getActivation({
      providerActivationId: snapshot.provider_activation_id,
      activation: providerActivationPayload(snapshot),
    });
  } catch (error) {
    console.error('provider.status_failed', error);
    return mapActivation(snapshot);
  }

  if (!shouldApplyProviderState(snapshot, providerState)) {
    return mapActivation(snapshot);
  }

  // Phase 2: short transaction. Re-check the authoritative current row and
  // apply the provider result only if the activation is still Active. This
  // prevents an in-flight provider response from overwriting cancellation or
  // another newer lifecycle transition.
  return withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT a.*
       FROM activations a
       WHERE a.id=$1 AND a.user_id=$2
       FOR UPDATE`,
      [id, userId]
    );
    if (!locked.rowCount) return null;

    const current = locked.rows[0];
    if (!shouldApplyProviderState(current, providerState)) {
      return mapActivation(current);
    }

    const updated = await client.query(
      `UPDATE activations
       SET status=$2, otp=$3, updated_at=NOW()
       WHERE id=$1 AND user_id=$4 AND status='Active'
       RETURNING *`,
      [id, providerState.status, providerState.otp, userId]
    );

    if (!updated.rowCount) {
      return mapActivation(current);
    }

    const row = updated.rows[0];
    if (providerState.status === 'Expired') {
      // Only the Active -> Expired transition restores inventory.
      await client.query(
        'UPDATE services SET stock=stock+1,updated_at=NOW() WHERE id=$1',
        [row.service_id]
      );
    }

    return mapActivation(row);
  });
}

export async function cancelActivation(id, userId) {
  const begun = await beginCancellation(id, userId);
  if (!begun) return null;
  if (!begun.operation) return { activation: mapActivation(begun.activation), balancePaise: null };
  if (!begun.adapterKey || !begun.providerPayload?.providerActivationId) {
    const result = await completeCancellation(begun.operation.id, true);
    return result.activation ? { activation: mapActivation(result.activation), balancePaise: result.balancePaise } : { activation: mapActivation(begun.activation), balancePaise: null };
  }
  try {
    const adapter = getProviderAdapter(begun.adapterKey);
    await adapter.cancelActivation(begun.providerPayload);
    const result = await completeCancellation(begun.operation.id, true);
    return result.activation ? { activation: mapActivation(result.activation), balancePaise: result.balancePaise } : { activation: mapActivation(begun.activation), balancePaise: null };
  } catch (error) {
    await completeCancellation(begun.operation.id, false, error.message);
    const e = new Error('Provider cancellation failed; activation remains active and can be retried');
    e.code = 'PROVIDER_CANCEL_FAILED';
    throw e;
  }
}

export async function listActivations(userId, limit = 50) {
  const pool = await getPool();
  if (!pool) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const result = await pool.query(
    'SELECT * FROM activations WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', [userId, safeLimit]
  );
  return result.rows.map(mapActivation);
}
