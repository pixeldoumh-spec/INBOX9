import crypto from 'node:crypto';
import { getPool, withTransaction } from './db.js';
import { getProviderAdapter } from './provider-registry.js';
import { invokeProvider, providerCapabilities } from './provider-gateway.js';
import { qualifyProviders } from './provider-qualification.js';
import { recordAuditTx } from './admin-repository.js';

const EXTERNAL_CANARY_ENABLED_ENV = 'INBOX9_RUN_BILLABLE_PROVIDER_CANARY';
const EXTERNAL_CANARY_CONFIRMATION = 'RUN_ONE_BILLABLE_CANARY';
const DEFAULT_MAX_COST_USD = 1;
const DEFAULT_MAX_WAIT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 3_000;

function boolEnv(name) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

function maxCostUsd() {
  const value = Number(process.env.INBOX9_PROVIDER_CANARY_MAX_COST_USD);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 50) : DEFAULT_MAX_COST_USD;
}

function maxWaitMs() {
  const value = Number(process.env.INBOX9_PROVIDER_CANARY_MAX_WAIT_MS);
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 5_000), 300_000) : DEFAULT_MAX_WAIT_MS;
}

function pollIntervalMs() {
  const value = Number(process.env.INBOX9_PROVIDER_CANARY_POLL_INTERVAL_MS);
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 1_000), 10_000) : DEFAULT_POLL_INTERVAL_MS;
}

function safeError(error) {
  return { code: String(error?.code || 'PROVIDER_LIFECYCLE_FAILED').slice(0, 120), message: String(error?.message || 'Provider lifecycle certification failed').slice(0, 300) };
}

async function saveCertification(row, adminUserId = null) {
  const id = crypto.randomUUID();
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO provider_lifecycle_certifications
       (id,provider_id,service_id,country,mode,status,reserve_ok,poll_ok,completion_ok,cancellation_ok,reconciliation_ok,cleanup_ok,billable,provider_activation_id,provider_service_code,observed_price_usd,started_at,completed_at,error_code,error_message,details)
       VALUES ($1,$2,$3,'IN',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb)`,
      [id, row.providerId, row.serviceId || null, row.mode, row.status, Boolean(row.reserveOk), Boolean(row.pollOk), Boolean(row.completionOk), Boolean(row.cancellationOk), Boolean(row.reconciliationOk), Boolean(row.cleanupOk), Boolean(row.billable), row.providerActivationId || null, row.providerServiceCode || null, row.observedPriceUsd == null ? null : Number(row.observedPriceUsd), row.startedAt ? new Date(row.startedAt) : new Date(), row.completedAt ? new Date(row.completedAt) : null, row.errorCode || null, row.errorMessage || null, JSON.stringify(row.details || {})]
    );
    if (adminUserId) {
      await recordAuditTx(client, adminUserId, 'provider.lifecycle_certification_recorded', 'provider', row.providerId, {
        serviceId: row.serviceId || null,
        mode: row.mode,
        status: row.status,
        reserveOk: Boolean(row.reserveOk),
        pollOk: Boolean(row.pollOk),
        completionOk: Boolean(row.completionOk),
        cancellationOk: Boolean(row.cancellationOk),
        reconciliationOk: Boolean(row.reconciliationOk),
        cleanupOk: Boolean(row.cleanupOk),
        billable: Boolean(row.billable),
      });
    }
  });
  return id;
}

async function providerContext(providerId, serviceId) {
  const snapshot = await qualifyProviders();
  const provider = snapshot.providers.find((row) => row.id === String(providerId));
  if (!provider) throw Object.assign(new Error('Provider not found'), { code: 'PROVIDER_NOT_FOUND', statusCode: 404 });
  if (provider.adapterKey === 'synthetic') throw Object.assign(new Error('Synthetic provider uses the non-billable lifecycle certification'), { code: 'SYNTHETIC_PROVIDER_USE_DEDICATED_CANARY', statusCode: 400 });
  const service = snapshot.services.find((row) => row.id === String(serviceId));
  if (!service) throw Object.assign(new Error('Service not found'), { code: 'SERVICE_NOT_FOUND', statusCode: 404 });
  return { snapshot, provider, service, qualification: service.providers[provider.adapterKey] || null };
}

export async function preflightExternalLifecycleCertification({ providerId, serviceId }) {
  const context = await providerContext(providerId, serviceId);
  const provider = context.provider;
  const service = context.service;
  const qualification = context.qualification;
  const blockers = [];
  if (!provider.configured) blockers.push({ code: 'CREDENTIALS_REQUIRED', message: 'Server-side provider credentials are not configured' });
  if (provider.status !== 'catalog_verified') blockers.push({ code: 'PROVIDER_CATALOG_NOT_VERIFIED', message: 'Live India provider catalog is not verified' });
  if (qualification?.status !== 'mapped_verified') blockers.push({ code: 'PROVIDER_SERVICE_MAPPING_REQUIRED', message: 'The selected service is not mapped to a verified live provider service code' });
  const providerPrice = qualification?.providerPrice == null ? null : Number(qualification.providerPrice);
  const providerStock = qualification?.providerStock == null ? null : Number(qualification.providerStock);
  if (providerPrice == null || !Number.isFinite(providerPrice)) blockers.push({ code: 'PROVIDER_PRICE_REQUIRED', message: 'Live provider price is required before a billable canary' });
  else if (providerPrice > maxCostUsd()) blockers.push({ code: 'PROVIDER_CANARY_COST_LIMIT', message: 'Live provider price exceeds the configured canary cost limit' });
  if (providerStock != null && Number.isFinite(providerStock) && providerStock <= 0) blockers.push({ code: 'PROVIDER_NO_INVENTORY', message: 'Provider reports no India inventory for the selected service' });
  let health = null;
  if (!blockers.some((row) => row.code === 'CREDENTIALS_REQUIRED')) {
    try {
      health = await getProviderAdapter(provider.adapterKey).health();
      if (health?.healthy !== true) blockers.push({ code: 'PROVIDER_HEALTH_FAILED', message: 'Provider health check did not pass' });
    } catch (error) {
      const normalized = safeError(error);
      blockers.push({ code: normalized.code, message: normalized.message });
    }
  }
  return {
    providerId: provider.id, adapterKey: provider.adapterKey, serviceId: service.id, serviceName: service.name,
    providerServiceCode: qualification?.mapping || null, providerPriceUsd: providerPrice, providerStock,
    providerHealth: health ? { healthy: Boolean(health.healthy), configured: Boolean(health.configured), currency: health.currency || null } : null,
    externalCanaryEnabled: boolEnv(EXTERNAL_CANARY_ENABLED_ENV), maxCostUsd: maxCostUsd(),
    status: blockers.length ? 'blocked' : 'ready', blockers,
  };
}

export async function runSyntheticLifecycleCertification(adminUserId = null) {
  const providerId = 'provider-mock';
  const pool = await getPool();
  if (!pool) throw new Error('Lifecycle certification requires PostgreSQL');
  const serviceResult = await pool.query('SELECT id,name,country,currency,price_paise FROM services WHERE active=TRUE ORDER BY id LIMIT 1');
  if (!serviceResult.rowCount) throw new Error('No active service available for synthetic lifecycle certification');
  const service = serviceResult.rows[0];
  const startedAt = Date.now();
  let reserved = null;
  try {
    const adapter = getProviderAdapter('synthetic');
    reserved = await invokeProvider({ provider: { id: providerId, name: 'Synthetic', adapter_key: 'synthetic' }, operation: 'reserveNumber', input: { id: service.id, name: service.name, country: service.country || 'IN', currency: service.currency, pricePaise: Number(service.price_paise), serverId: null } });
    const active = await invokeProvider({ provider: { id: providerId, name: 'Synthetic', adapter_key: 'synthetic' }, operation: 'getActivation', input: { activation: reserved } });
    const cancelled = await invokeProvider({ provider: { id: providerId, name: 'Synthetic', adapter_key: 'synthetic' }, operation: 'cancelActivation', input: { activation: active } });
    const passed = cancelled?.status === 'Refunded';
    const result = { providerId, serviceId: service.id, adapterKey: 'synthetic', mode: 'contract', status: passed ? 'passed' : 'failed', reserveOk: Boolean(reserved?.providerActivationId && reserved?.number), pollOk: Boolean(active?.providerActivationId), completionOk: false, cancellationOk: Boolean(cancelled), reconciliationOk: true, cleanupOk: passed, billable: false, providerActivationId: null, providerServiceCode: null, observedPriceUsd: null, startedAt, completedAt: Date.now(), details: { reserveStatus: reserved?.status || null, activationStatus: active?.status || null, terminalStatus: cancelled?.status || null, capabilities: providerCapabilities(adapter) } };
    const certificationId = await saveCertification(result, adminUserId);
    return { certificationId, ...result };
  } catch (error) {
    const normalized = safeError(error);
    const result = { providerId, serviceId: service.id, adapterKey: 'synthetic', mode: 'contract', status: 'failed', reserveOk: Boolean(reserved), pollOk: false, completionOk: false, cancellationOk: false, reconciliationOk: false, cleanupOk: false, billable: false, startedAt, completedAt: Date.now(), errorCode: normalized.code, errorMessage: normalized.message, details: {} };
    const certificationId = await saveCertification(result, adminUserId);
    return { certificationId, ...result };
  }
}

async function reconciliationClear(providerId) {
  const pool = await getPool();
  const result = await pool.query('SELECT (SELECT COUNT(*) FROM provider_operations WHERE provider_id=$1 AND status=\'Pending\')::int AS pending, (SELECT COUNT(*) FROM provider_operations WHERE provider_id=$1 AND status=\'Pending\' AND updated_at<NOW()-INTERVAL \'10 minutes\')::int AS stale', [providerId]);
  return Number(result.rows[0]?.pending || 0) === 0 && Number(result.rows[0]?.stale || 0) === 0;
}

export async function runExternalLifecycleCertification(adminUserId, { providerId, serviceId, confirmation }) {
  if (!boolEnv(EXTERNAL_CANARY_ENABLED_ENV)) throw Object.assign(new Error('Billable external lifecycle canary is disabled'), { code: 'EXTERNAL_CANARY_DISABLED', statusCode: 409 });
  if (confirmation !== EXTERNAL_CANARY_CONFIRMATION) throw Object.assign(new Error('Explicit billable canary confirmation is required'), { code: 'EXTERNAL_CANARY_CONFIRMATION_REQUIRED', statusCode: 409 });
  const preflight = await preflightExternalLifecycleCertification({ providerId, serviceId });
  if (preflight.status !== 'ready') {
    const error = Object.assign(new Error('External lifecycle canary preflight is blocked'), { code: 'EXTERNAL_CANARY_PREFLIGHT_BLOCKED', statusCode: 409 });
    error.blockers = preflight.blockers;
    throw error;
  }
  const adapter = getProviderAdapter(preflight.adapterKey);
  const capabilities = providerCapabilities(adapter);
  const startedAt = Date.now();
  let reserved = null;
  try {
    reserved = await invokeProvider({ provider: { id: preflight.providerId, name: preflight.adapterKey, adapter_key: preflight.adapterKey }, operation: 'reserveNumber', input: { id: preflight.serviceId, name: preflight.serviceName, country: 'IN', providerServiceCode: preflight.providerServiceCode, canary: true } });
    const providerActivationId = String(reserved.providerActivationId);
    const deadline = Date.now() + maxWaitMs();
    let latest = reserved;
    while (Date.now() < deadline) {
      latest = await invokeProvider({ provider: { id: preflight.providerId, name: preflight.adapterKey, adapter_key: preflight.adapterKey }, operation: 'getActivation', input: { providerActivationId, activation: latest } });
      if (latest?.status === 'Completed' || latest?.status === 'Expired' || latest?.status === 'Cancelled') break;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs()));
    }
    const completed = latest?.status === 'Completed';
    let cancelled = false;
    let cleanupError = null;
    if (!completed && latest?.status === 'Active' && capabilities.cancelActivation === true) {
      try {
        const terminal = await invokeProvider({ provider: { id: preflight.providerId, name: preflight.adapterKey, adapter_key: preflight.adapterKey }, operation: 'cancelActivation', input: { providerActivationId, activation: latest } });
        cancelled = terminal?.status === 'Refunded' || terminal?.status === 'Cancelled';
        latest = terminal || latest;
      } catch (error) { cleanupError = safeError(error); }
    }
    const reconciliationOk = await reconciliationClear(preflight.providerId);
    const cleanupOk = completed || cancelled;
    const status = completed || cancelled ? 'passed' : cleanupError ? 'failed' : 'awaiting_otp';
    const result = { providerId: preflight.providerId, serviceId: preflight.serviceId, adapterKey: preflight.adapterKey, mode: 'external', status, reserveOk: Boolean(reserved?.providerActivationId && reserved?.number), pollOk: Boolean(latest?.providerActivationId), completionOk: completed, cancellationOk: cancelled, reconciliationOk, cleanupOk, billable: true, providerActivationId, providerServiceCode: preflight.providerServiceCode, observedPriceUsd: preflight.providerPriceUsd, startedAt, completedAt: status === 'awaiting_otp' ? null : Date.now(), errorCode: cleanupError?.code || null, errorMessage: cleanupError?.message || null, details: { providerStatus: latest?.status || null, canaryConfirmationRequired: true, maxWaitMs: maxWaitMs(), pollIntervalMs: pollIntervalMs(), cleanupRequired: !cleanupOk, cleanupError: cleanupError?.code || null } };
    const certificationId = await saveCertification(result, adminUserId);
    return { certificationId, ...result };
  } catch (error) {
    const normalized = safeError(error);
    const result = { providerId: preflight.providerId, serviceId: preflight.serviceId, adapterKey: preflight.adapterKey, mode: 'external', status: 'failed', reserveOk: Boolean(reserved?.providerActivationId), pollOk: false, completionOk: false, cancellationOk: false, reconciliationOk: await reconciliationClear(preflight.providerId).catch(() => false), cleanupOk: false, billable: true, providerActivationId: reserved?.providerActivationId || null, providerServiceCode: preflight.providerServiceCode, observedPriceUsd: preflight.providerPriceUsd, startedAt, completedAt: Date.now(), errorCode: normalized.code, errorMessage: normalized.message, details: { canaryConfirmationRequired: true } };
    const certificationId = await saveCertification(result, adminUserId);
    return { certificationId, ...result };
  }
}

export async function listLifecycleCertifications({ providerId = null, limit = 50 } = {}) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 250);
  const params = [];
  const where = [];
  if (providerId) { params.push(String(providerId)); where.push('provider_id=$' + params.length); }
  params.push(safeLimit);
  const query = 'SELECT id,provider_id,service_id,country,mode,status,reserve_ok,poll_ok,completion_ok,cancellation_ok,reconciliation_ok,cleanup_ok,billable,provider_activation_id,provider_service_code,observed_price_usd,started_at,completed_at,error_code,error_message,details,created_at FROM provider_lifecycle_certifications ' + (where.length ? 'WHERE ' + where.join(' AND ') + ' ' : '') + 'ORDER BY created_at DESC LIMIT $' + params.length;
  const result = await pool.query(query, params);
  return result.rows.map((row) => ({ certificationId: row.id, providerId: row.provider_id, serviceId: row.service_id, country: row.country, mode: row.mode, status: row.status, reserveOk: Boolean(row.reserve_ok), pollOk: Boolean(row.poll_ok), completionOk: Boolean(row.completion_ok), cancellationOk: Boolean(row.cancellation_ok), reconciliationOk: Boolean(row.reconciliation_ok), cleanupOk: Boolean(row.cleanup_ok), billable: Boolean(row.billable), providerActivationId: row.provider_activation_id || null, providerServiceCode: row.provider_service_code || null, observedPriceUsd: row.observed_price_usd == null ? null : Number(row.observed_price_usd), startedAt: new Date(row.started_at).getTime(), completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null, errorCode: row.error_code || null, errorMessage: row.error_message || null, details: row.details || {}, createdAt: new Date(row.created_at).getTime() }));
}

export async function latestSuccessfulLifecycleCertification(providerId) {
  const rows = await listLifecycleCertifications({ providerId, limit: 25 });
  return rows.find((row) => row.status === 'passed' && row.cleanupOk && row.reconciliationOk) || null;
}