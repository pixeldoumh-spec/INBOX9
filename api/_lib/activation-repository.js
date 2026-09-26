import crypto from 'node:crypto';
import { getPool, withTransaction } from './db.js';
import { createNotificationTx } from './notification-repository.js';
import { invokeProvider } from './provider-gateway.js';
import { beginCancellation, completeCancellation } from './provider-operations.js';
import { debitForActivation, getBalanceForClient } from './wallet-repository.js';
import { completeActivationKey, markActivationKeyStuckSafe } from './idempotency.js';
import { claimSyntheticSlot, releaseSyntheticSlot, shouldRestoreSyntheticStock, shouldRequireSyntheticReservation } from './synthetic-inventory-repository.js';
import { getProviderAdapter } from './provider-registry.js';
import { providerCapabilities } from './provider-gateway.js';

const TTL_MS = 25 * 60 * 1000;
const SYNTHETIC_SLOT_RESERVATION_ATTEMPTS = 8;
export const ACTIVATION_QUOTA_LIMIT = 10;

function virtualSmsCanaryCap() {
  const value = Number(process.env.VIRTUALSMS_CANARY_MAX_ALLOCATIONS || 30);
  return Number.isFinite(value) && value >= 1 ? Math.min(Math.trunc(value), 1000) : 30;
}

async function enforceActivationQuotas(client, { userId, serviceId, provider }) {
  const adapterKey = String(provider?.adapter_key || '').trim().toLowerCase();
  if (adapterKey === 'synthetic') return;

  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [String(userId) + ':' + String(serviceId)]);
  const active = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM activations
      WHERE user_id=$1 AND service_id=$2
        AND status IN ('Active','CancellationPending','ExpirationPending')`,
    [userId, serviceId]
  );
  if (Number(active.rows[0]?.count || 0) >= ACTIVATION_QUOTA_LIMIT) {
    const error = new Error('You can have at most 10 active allocations for this service on this account');
    error.code = 'ACTIVATION_QUOTA_EXCEEDED';
    throw error;
  }

  if (adapterKey === 'virtualsms' && String(process.env.VIRTUALSMS_CANARY_ENABLED || '').trim().toLowerCase() === 'true') {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['virtualsms-canary-budget']);
    const used = await client.query(
      `SELECT COUNT(*)::int AS count
         FROM activations a
         JOIN providers p ON p.id=a.provider_id
        WHERE p.adapter_key='virtualsms'`
    );
    if (Number(used.rows[0]?.count || 0) >= virtualSmsCanaryCap()) {
      const error = new Error('VirtualSMS canary allocation budget has been reached');
      error.code = 'VIRTUALSMS_CANARY_CAP_REACHED';
      throw error;
    }
  }
}

/**
 * Build the canonical payload sent to a fulfillment provider for a number reservation.
 *
 * Provider adapters own their provider-specific request details. INBOX9 only supplies
 * canonical service/account data plus an idempotency key. Internal synthetic-server
 * selection is permitted only in non-production synthetic QA and is never forwarded to
 * a real provider.
 */
export function buildProviderReserveInput({
  catalogService,
  persistedService,
  provider,
  serverId = null,
  idempotencyKey = null,
  nodeEnv = process.env.NODE_ENV,
}) {
  const dbService = persistedService || {};
  const input = {
    ...catalogService,
    ...dbService,
    pricePaise: Number(dbService.price_paise ?? catalogService?.pricePaise ?? 0),
    stock: Number(dbService.stock ?? catalogService?.stock ?? 0),
    active: dbService.active == null ? Boolean(catalogService?.active ?? true) : Boolean(dbService.active),
    idempotencyKey: idempotencyKey || null,
  };

  const adapterKey = String(provider?.adapter_key || provider?.adapterKey || '').trim().toLowerCase();
  if (adapterKey === 'synthetic' && nodeEnv !== 'production') {
    input.serverId = serverId ? String(serverId).trim().toLowerCase() : null;
  }

  return input;
}

function providerCanCancel(adapterKey) {
  if (!adapterKey) return false;
  try {
    return providerCapabilities(getProviderAdapter(adapterKey)).cancelActivation === true;
  } catch {
    return false;
  }
}

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

  };
}

function makeId() {
  return `ORD-${crypto.randomUUID()}`;
}


export async function createActivation(service, userId, idempotency = null, options = {}) {
  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');

  let provider = null;
  let reserved = null;

  const providerRoute = await pool.query(
    `SELECT p.id,p.name,p.adapter_key,p.priority
       FROM service_provider_routes r JOIN providers p ON p.id=r.provider_id
      WHERE r.service_id=$1 AND r.active=TRUE AND p.active=TRUE
      ORDER BY r.priority ASC,p.priority ASC,p.id ASC LIMIT 1`,
    [service.id]
  );
  if (!providerRoute.rowCount) {
    const error = new Error('No active provider is configured for this service');
    error.code = 'NO_PROVIDER';
    throw error;
  }
  provider = providerRoute.rows[0];

  if (process.env.NODE_ENV === 'production' && provider.adapter_key === 'synthetic') {
    const error = new Error('Real activation provider is not configured');
    error.code = 'REAL_PROVIDER_REQUIRED';
    throw error;
  }

  for (let attempt = 1; attempt <= SYNTHETIC_SLOT_RESERVATION_ATTEMPTS; attempt += 1) {
    try {
      const latestService = await pool.query(
        `SELECT id,name,category,currency,price_paise,country,availability,stock,active
           FROM services WHERE id=$1`,
        [service.id]
      );
      if (!latestService.rowCount || !latestService.rows[0].active) {
        const error = new Error('Service is unavailable');
        error.code = 'SERVICE_UNAVAILABLE';
        throw error;
      }

      reserved = await invokeProvider({
        provider,
        operation: 'reserveNumber',
        input: {
          ...buildProviderReserveInput({
            catalogService: service,
            persistedService: latestService.rows[0],
            provider,
            serverId: options.serverId || null,
            idempotencyKey: idempotency?.idempotencyKey || null,
          }),
      });

      return await withTransaction(async (client) => {
        const serviceRow = await client.query(
          `SELECT id,name,category,currency,price_paise,country,availability,stock,active
             FROM services WHERE id=$1 FOR UPDATE`,
          [service.id]
        );
        if (!serviceRow.rowCount || !serviceRow.rows[0].active) {
          const error = new Error('Service is unavailable');
          error.code = 'SERVICE_UNAVAILABLE';
          throw error;
        }
        const dbService = serviceRow.rows[0];
        if (Number(dbService.stock) <= 0) {
          const error = new Error('This service is currently out of stock');
          error.code = 'OUT_OF_STOCK';
          throw error;
        }

        const now = new Date();
        const expiresAt = new Date(reserved.expiresAt || now.getTime() + TTL_MS);
        const activationId = makeId();
        const pricePaise = Number(dbService.price_paise);
        const serviceName = dbService.name;
        const currency = dbService.currency || 'INR';
        const country = dbService.country || 'IN';
        await enforceActivationQuotas(client, { userId, serviceId: service.id, provider });
        if (country !== 'IN' || currency !== 'INR') {
          const error = new Error('Service is unavailable');
          error.code = 'SERVICE_UNAVAILABLE';
          throw error;
        }

        await debitForActivation(client, userId, pricePaise, activationId, `${serviceName} activation`);
        await client.query(
          `INSERT INTO activations
            (id,user_id,service_id,service_name,country,phone_number,price_paise,currency,status,otp,created_at,expires_at,mock_otp_at,provider_id,provider_activation_id,provider_metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING *`,
          [activationId,userId,service.id,serviceName,country,reserved.number,pricePaise,currency,
           reserved.status || 'Active',reserved.otp,now,expiresAt,
           reserved.mockOtpAt ? new Date(reserved.mockOtpAt) : null,provider.id,reserved.providerActivationId,JSON.stringify(reserved.metadata || {})]
        );

        if (provider.adapter_key === 'synthetic') {
          const slot = Number(reserved.metadata?.slot);
          const serverId = String(reserved.metadata?.serverId || '').trim().toLowerCase();
          await claimSyntheticSlot(client, {
            activationId,
            serviceId: service.id,
            slot,
            serverId,
            reservedAt: now,
          });
        }

        await client.query(
          `UPDATE services SET stock=stock-1,updated_at=NOW() WHERE id=$1`,
          [service.id]
        );

        const result = await client.query('SELECT * FROM activations WHERE id=$1', [activationId]);
        const activation = mapActivation({ ...result.rows[0], adapter_key: provider.adapter_key });
        const balancePaise = await getBalanceForClient(client, userId);
        await createNotificationTx(client, {
          userId, kind:'activation', sourceType:'activation', sourceId:activation.id, eventKey:'status:'+activation.status,
          title: activation.status === 'Active' ? 'Number allocated successfully' : 'Activation started',
          body: activation.number ? `Your ${serviceName} number ${activation.number} is ready. Open Buy to continue to OTP.` : `Your ${serviceName} activation has started.`,
          page:'buy', tone:'success', createdAt:now
        });
        if (idempotency?.idempotencyKey) {
          await completeActivationKey(client, userId, idempotency.idempotencyKey, activation.id, { ...activation, walletBalancePaise: balancePaise });
        }
        return { activation, balancePaise };
      });
    } catch (error) {
      if (error.code === 'SYNTHETIC_SLOT_CONFLICT' && provider.adapter_key === 'synthetic' && attempt < SYNTHETIC_SLOT_RESERVATION_ATTEMPTS) {
        continue;
      }

      if (reserved?.providerActivationId) {
        let compensated = false;
        try {
          await invokeProvider({
            provider,
            operation: 'cancelActivation',
            input: { providerActivationId: reserved.providerActivationId, activation: reserved },
          });
          compensated = true;
        } catch {}

        if (idempotency?.idempotencyKey) {
          if (compensated) {
            const poolForFailure = await getPool();
            if (poolForFailure) {
              await poolForFailure.query(
                `UPDATE activation_idempotency
                    SET status='Failed', error_code=$3, error_message=$4, updated_at=NOW()
                  WHERE user_id=$1 AND idempotency_key=$2 AND status='Processing'`,
                [userId, idempotency.idempotencyKey, String(error.code || 'ACTIVATION_FAILED').slice(0,80), String(error.message || 'Activation failed').slice(0,500)]
              );
            }
          } else {
            await markActivationKeyStuckSafe(userId, idempotency.idempotencyKey, 'Provider compensation failed; manual/reconciliation action is required before retrying.');
          }
        }
      }
      throw error;
    }
  }

  const error = new Error('Number inventory is temporarily unavailable; please retry.');
  error.code = 'SYNTHETIC_INVENTORY_BUSY';
  throw error;
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
  if (process.env.NODE_ENV === 'production' && snapshot.adapter_key === 'synthetic' && snapshot.status === 'Active') {
    const error = new Error('Real activation provider is not configured');
    error.code = 'REAL_PROVIDER_REQUIRED';
    throw error;
  }
  if (!snapshot.provider_id || !snapshot.provider_activation_id || snapshot.status !== 'Active') {
    return mapActivation(snapshot);
  }

  let providerState;
  try {
    // Provider I/O intentionally occurs outside any open database transaction.
    providerState = await invokeProvider({
      provider: { id: snapshot.provider_id, adapter_key: snapshot.adapter_key },
      operation: 'getActivation',
      input: {
        providerActivationId: snapshot.provider_activation_id,
        activation: providerActivationPayload(snapshot),
      },
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
    await createNotificationTx(client, {
      userId, kind:'activation', sourceType:'activation', sourceId:row.id, eventKey:'status:'+providerState.status,
      title: providerState.status === 'Completed' ? 'OTP received successfully' : 'Number expired',
      body: providerState.status === 'Completed' ? `Verification code is ready for ${row.service_name}. Open Buy to view the OTP.` : `Your ${row.service_name} activation has reached its validity limit.`,
      page:'buy', tone: providerState.status === 'Completed' ? 'success' : 'info'
    });
    if (providerState.status === 'Expired' || providerState.status === 'Completed') {
      const released = await releaseSyntheticSlot(client, row.id);
      if (!released && shouldRequireSyntheticReservation(row.provider_metadata)) {
        throw new Error('Synthetic inventory reservation is missing for terminal activation');
      }
      if (shouldRestoreSyntheticStock(providerState.status)) {
        await client.query(
          'UPDATE services SET stock=stock+1,updated_at=NOW() WHERE id=$1',
          [row.service_id]
        );
      }
    }

    return mapActivation(row);
  });
}

export async function cancelActivation(id, userId) {
  const begun = await beginCancellation(id, userId);
  if (!begun) return null;
  if (!begun.operation) return { activation: mapActivation(begun.activation), balancePaise: null };
  if (begun.alreadyPending) {
    return { activation: mapActivation(begun.activation), balancePaise: null, pending: true };
  }
  if (!begun.adapterKey || !begun.providerPayload?.providerActivationId) {
    const result = await completeCancellation(begun.operation.id, true);
    return result.activation ? { activation: mapActivation(result.activation), balancePaise: result.balancePaise } : { activation: mapActivation(begun.activation), balancePaise: null };
  }
  try {
    await invokeProvider({
      provider: { id: begun.providerId, adapter_key: begun.adapterKey },
      operation: 'cancelActivation',
      input: begun.providerPayload,
    });
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
    `SELECT a.*,p.adapter_key
       FROM activations a
       LEFT JOIN providers p ON p.id=a.provider_id
      WHERE a.user_id=$1
      ORDER BY a.created_at DESC LIMIT $2`, [userId, safeLimit]
  );
  return result.rows.map(mapActivation);
}
