import crypto from 'node:crypto';
import { getPool } from './db.js';
import { invokeProvider, providerCapabilities } from './provider-gateway.js';
import { getProviderAdapter } from './provider-registry.js';

export const ROUTING_CIRCUIT_FAILURE_THRESHOLD = 3;
export const ROUTING_CIRCUIT_COOLDOWN_MS = 2 * 60 * 1000;

const EXTERNAL_ROUTING_ENABLED = String(process.env.INBOX9_ENABLE_EXTERNAL_ROUTING || '').trim().toLowerCase() === 'true';
const ALLOW_NONCANCELLABLE_RESERVE = String(process.env.INBOX9_ALLOW_NONCANCELLABLE_PROVIDER_RESERVE || '').trim().toLowerCase() === 'true';
const PROVIDER_CERT_MAX_AGE_MS = (() => {
  const value = Number(process.env.INBOX9_PROVIDER_CERT_MAX_AGE_MS);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.max(Math.trunc(value), 60_000), 7 * 24 * 60 * 60 * 1000) : 24 * 60 * 60 * 1000;
})();

const SAFE_FAILOVER_CODES = new Set([
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_SERVICE_MAPPING_REQUIRED',
  'PROVIDER_SERVICE_UNAVAILABLE',
  'PROVIDER_NO_INVENTORY',
  'NO_AVAILABLE_NUMBERS',
  'NO_STOCK',
  'OUT_OF_STOCK',
  'SERVICE_UNAVAILABLE',
  'PROVIDER_RATE_LIMITED',
]);

export function failoverDecision(error) {
  const code = String(error?.code || '').trim().toUpperCase();
  const safeToFailover = SAFE_FAILOVER_CODES.has(code) || Number(error?.status) === 429;
  return { safeToFailover, stopChain: !safeToFailover };
}

async function writeAttempt(pool, values) {
  await pool.query(
    `INSERT INTO provider_route_attempts
      (id,service_id,provider_id,operation_type,outcome,safe_to_failover,error_code,latency_ms)
     VALUES ($1,$2,$3,'reserveNumber',$4,$5,$6,$7)`,
    ['PRA-' + crypto.randomUUID(), values.serviceId, values.providerId, values.outcome, Boolean(values.safeToFailover), values.errorCode ? String(values.errorCode).slice(0,120) : null, Number.isFinite(Number(values.latencyMs)) ? Math.max(0, Math.trunc(Number(values.latencyMs))) : null],
  );
}

async function noteFailure(pool, { serviceId, providerId, error }) {
  await pool.query(
    `INSERT INTO provider_route_health
      (provider_id,service_id,consecutive_failures,opened_until,last_error_code,last_error_message,last_failure_at,updated_at)
     VALUES ($1,$2,1,NULL,$3,$4,NOW(),NOW())
     ON CONFLICT (provider_id,service_id)
     DO UPDATE SET
       consecutive_failures = provider_route_health.consecutive_failures + 1,
       opened_until = CASE
         WHEN provider_route_health.consecutive_failures + 1 >= $5
         THEN NOW() + ($6 * INTERVAL '1 millisecond')
         ELSE provider_route_health.opened_until
       END,
       last_error_code = EXCLUDED.last_error_code,
       last_error_message = EXCLUDED.last_error_message,
       last_failure_at = NOW(),
       updated_at = NOW()`,
    [providerId, serviceId, String(error?.code || 'PROVIDER_OPERATION_FAILED').slice(0,120), String(error?.message || 'Provider route failed').slice(0,500), ROUTING_CIRCUIT_FAILURE_THRESHOLD, ROUTING_CIRCUIT_COOLDOWN_MS],
  );
}

async function noteSuccess(pool, { serviceId, providerId }) {
  await pool.query(
    `INSERT INTO provider_route_health
      (provider_id,service_id,consecutive_failures,opened_until,last_success_at,updated_at)
     VALUES ($1,$2,0,NULL,NOW(),NOW())
     ON CONFLICT (provider_id,service_id)
     DO UPDATE SET
       consecutive_failures = 0,
       opened_until = NULL,
       last_error_code = NULL,
       last_error_message = NULL,
       last_success_at = NOW(),
       updated_at = NOW()`,
    [providerId, serviceId],
  );
}

async function eligibleRoutes(pool, serviceId) {
  const result = await pool.query(
    `SELECT r.service_id,r.provider_id,r.priority AS route_priority,
            p.name AS provider_name,p.adapter_key,p.priority AS provider_priority,
            m.provider_service_code,h.consecutive_failures,h.opened_until
       FROM service_provider_routes r
       JOIN providers p ON p.id=r.provider_id
       LEFT JOIN provider_service_mappings m
         ON m.provider_id=r.provider_id AND m.service_id=r.service_id AND m.active=TRUE
       LEFT JOIN provider_route_health h
         ON h.provider_id=r.provider_id AND h.service_id=r.service_id
      WHERE r.service_id=$1 AND r.active=TRUE AND p.active=TRUE
        AND (p.adapter_key='synthetic' OR m.provider_service_code IS NOT NULL)
        AND (h.opened_until IS NULL OR h.opened_until <= NOW())
        AND (p.adapter_key='synthetic' OR EXISTS (
          SELECT 1
            FROM provider_lifecycle_certifications c
           WHERE c.provider_id=r.provider_id
             AND c.service_id=r.service_id
             AND c.mode='external'
             AND c.status='passed'
             AND c.cleanup_ok=TRUE
             AND c.reconciliation_ok=TRUE
             AND c.created_at > NOW() - ($2 * INTERVAL '1 millisecond')
             AND c.provider_service_code=m.provider_service_code
        ))
      ORDER BY r.priority ASC,p.priority ASC,p.id ASC`,
    [serviceId, PROVIDER_CERT_MAX_AGE_MS],
  );
  const filtered = EXTERNAL_ROUTING_ENABLED
    ? result.rows
    : result.rows.filter((row) => row.adapter_key === 'synthetic');
  return filtered.filter((row) => {
    if (row.adapter_key === 'synthetic') return true;
    if (ALLOW_NONCANCELLABLE_RESERVE) return true;
    try {
      return providerCapabilities(getProviderAdapter(row.adapter_key)).cancelActivation === true;
    } catch {
      return false;
    }
  });
}

export function externalRoutingEnabled() { return EXTERNAL_ROUTING_ENABLED; }
export function nonCancellableReserveAllowed() { return ALLOW_NONCANCELLABLE_RESERVE; }

export async function reserveNumberWithFailover({ service, serviceId, serverId = null, idempotencyKey = null, maxProviders = 5 } = {}) {
  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  const routes = (await eligibleRoutes(pool, serviceId)).slice(0, Math.max(1, Math.min(Number(maxProviders) || 5, 10)));
  if (!routes.length) {
    const error = new Error('No eligible provider route is available for this service');
    error.code = 'NO_PROVIDER_AVAILABLE';
    throw error;
  }

  const failures = [];
  for (const route of routes) {
    const startedAt = Date.now();
    try {
      const input = { ...service, idempotencyKey: idempotencyKey || null };
      if (route.adapter_key === 'synthetic') input.serverId = serverId ? String(serverId).trim().toLowerCase() : null;
      else input.providerServiceCode = route.provider_service_code;
      const reserved = await invokeProvider({
        provider: { id: route.provider_id, name: route.provider_name, adapter_key: route.adapter_key },
        operation: 'reserveNumber',
        input,
      });
      await noteSuccess(pool, { serviceId, providerId: route.provider_id }).catch(() => {});
      await writeAttempt(pool, { serviceId, providerId: route.provider_id, outcome: 'succeeded', safeToFailover: false, latencyMs: Date.now() - startedAt }).catch(() => {});
      return { provider: { id: route.provider_id, name: route.provider_name, adapter_key: route.adapter_key, routePriority: Number(route.route_priority) }, reserved, attempts: failures.length + 1 };
    } catch (error) {
      const decision = failoverDecision(error);
      const failure = { providerId: route.provider_id, providerName: route.provider_name, adapterKey: route.adapter_key, code: error?.code || 'PROVIDER_OPERATION_FAILED', message: error?.message || 'Provider route failed', safeToFailover: decision.safeToFailover };
      failures.push(failure);
      await writeAttempt(pool, { serviceId, providerId: route.provider_id, outcome: 'failed', safeToFailover: decision.safeToFailover, errorCode: error?.code, latencyMs: Date.now() - startedAt }).catch(() => {});
      if (!decision.safeToFailover) {
        const blocked = new Error('Provider allocation outcome is uncertain; automatic failover is disabled');
        blocked.code = 'PROVIDER_FAILOVER_BLOCKED';
        blocked.providerId = route.provider_id;
        blocked.adapterKey = route.adapter_key;
        blocked.causeCode = error?.code || null;
        blocked.retryable = false;
        blocked.safeToRetry = false;
        blocked.failures = failures;
        throw blocked;
      }
      await noteFailure(pool, { serviceId, providerId: route.provider_id, error }).catch(() => {});
    }
  }

  const error = new Error('No eligible provider could fulfill this service');
  error.code = 'NO_PROVIDER_AVAILABLE';
  error.retryable = true;
  error.safeToRetry = false;
  error.failures = failures;
  throw error;
}

export async function listProviderRouteHealth({ serviceId = null, providerId = null, limit = 100 } = {}) {
  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
  const params = [];
  const where = [];
  if (serviceId) { params.push(String(serviceId)); where.push('h.service_id=$' + params.length); }
  if (providerId) { params.push(String(providerId)); where.push('h.provider_id=$' + params.length); }
  params.push(safeLimit);
  const result = await pool.query(
    `SELECT h.provider_id,h.service_id,h.consecutive_failures,h.opened_until,h.last_error_code,h.last_error_message,h.last_failure_at,h.last_success_at,h.updated_at,p.name AS provider_name,p.adapter_key,s.name AS service_name
       FROM provider_route_health h
       JOIN providers p ON p.id=h.provider_id
       JOIN services s ON s.id=h.service_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY h.updated_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return result.rows.map(row => ({ providerId: row.provider_id, providerName: row.provider_name, adapterKey: row.adapter_key, serviceId: row.service_id, serviceName: row.service_name, consecutiveFailures: Number(row.consecutive_failures || 0), openedUntil: row.opened_until ? new Date(row.opened_until).getTime() : null, lastErrorCode: row.last_error_code || null, lastErrorMessage: row.last_error_message || null, lastFailureAt: row.last_failure_at ? new Date(row.last_failure_at).getTime() : null, lastSuccessAt: row.last_success_at ? new Date(row.last_success_at).getTime() : null, updatedAt: new Date(row.updated_at).getTime() }));
}

export async function listProviderRouteAttempts({ serviceId = null, providerId = null, limit = 100 } = {}) {
  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
  const params = [];
  const where = [];
  if (serviceId) { params.push(String(serviceId)); where.push('a.service_id=$' + params.length); }
  if (providerId) { params.push(String(providerId)); where.push('a.provider_id=$' + params.length); }
  params.push(safeLimit);
  const result = await pool.query(
    `SELECT a.id,a.service_id,a.provider_id,a.operation_type,a.outcome,a.safe_to_failover,a.error_code,a.latency_ms,a.created_at,p.name AS provider_name,p.adapter_key,s.name AS service_name
       FROM provider_route_attempts a
       JOIN providers p ON p.id=a.provider_id
       JOIN services s ON s.id=a.service_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY a.created_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return result.rows.map(row => ({ id: row.id, serviceId: row.service_id, serviceName: row.service_name, providerId: row.provider_id, providerName: row.provider_name, adapterKey: row.adapter_key, operationType: row.operation_type, outcome: row.outcome, safeToFailover: Boolean(row.safe_to_failover), errorCode: row.error_code || null, latencyMs: row.latency_ms == null ? null : Number(row.latency_ms), createdAt: new Date(row.created_at).getTime() }));
}