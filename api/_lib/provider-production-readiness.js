import { getPool, withTransaction } from './db.js';
import { getProviderAdapter } from './provider-registry.js';
import { providerCapabilities } from './provider-gateway.js';
import { externalRoutingEnabled, nonCancellableReserveAllowed } from './provider-routing.js';
import { qualifyProviders } from './provider-qualification.js';
import { services as catalogServices } from './catalog.js';
import { recordAuditTx } from './admin-repository.js';

const CREDENTIAL_ENV = Object.freeze({
  asms: 'INBOX9_ASMS_API_KEY',
  pvapins: 'INBOX9_PVAPINS_API_KEY',
  'sms-verification-number': 'INBOX9_SVNUMBER_API_KEY',
});

function configuredFor(provider) {
  if (provider.adapter_key === 'synthetic') return true;
  const envName = CREDENTIAL_ENV[provider.adapter_key];
  return Boolean(envName && String(process.env[envName] || '').trim());
}

async function runSyntheticLifecycleCanary() {
  const adapter = getProviderAdapter('synthetic');
  const service = catalogServices[0];
  if (!service) throw new Error('Synthetic canary requires at least one catalog service');
  const reserved = await adapter.reserveNumber({
    id: service.id,
    name: service.name,
    country: service.country || 'IN',
    currency: service.currency,
    pricePaise: service.pricePaise,
    serverId: null,
  });
  const active = await adapter.getActivation({ activation: reserved });
  const cancelled = await adapter.cancelActivation({ activation: active });
  if (!cancelled || cancelled.status !== 'Refunded') {
    throw new Error('Synthetic lifecycle canary did not reach Refunded');
  }
  return {
    provider: 'synthetic',
    reserve: Boolean(reserved?.providerActivationId && reserved?.number),
    getActivation: Boolean(active?.providerActivationId),
    cancel: cancelled.status === 'Refunded',
    status: 'passed',
  };
}

async function providerRowChecks(pool, provider, qualificationProvider) {
  const routeResult = await pool.query(
    "SELECT COUNT(*) FILTER (WHERE r.active=TRUE)::int AS active_routes, COUNT(*) FILTER (WHERE r.active=TRUE AND m.provider_service_code IS NOT NULL)::int AS mapped_routes FROM service_provider_routes r LEFT JOIN provider_service_mappings m ON m.provider_id=r.provider_id AND m.service_id=r.service_id AND m.active=TRUE WHERE r.provider_id=$1",
    [provider.id],
  );
  const healthResult = await pool.query(
    "SELECT COUNT(*) FILTER (WHERE opened_until IS NOT NULL AND opened_until > NOW())::int AS open_circuits, COALESCE(MAX(consecutive_failures),0)::int AS max_consecutive_failures FROM provider_route_health WHERE provider_id=$1",
    [provider.id],
  );
  const pendingResult = await pool.query(
    "SELECT COUNT(*)::int AS count FROM provider_operations WHERE provider_id=$1 AND status='Pending'",
    [provider.id],
  );
  const staleResult = await pool.query(
    "SELECT COUNT(*)::int AS count FROM provider_operations WHERE provider_id=$1 AND status='Pending' AND updated_at < NOW() - INTERVAL '10 minutes'",
    [provider.id],
  );
  const latestRecon = await pool.query(
    "SELECT status,started_at,completed_at FROM provider_reconciliation_runs ORDER BY started_at DESC LIMIT 1",
  );

  const activeRoutes = Number(routeResult.rows[0]?.active_routes || 0);
  const mappedRoutes = Number(routeResult.rows[0]?.mapped_routes || 0);
  const openCircuits = Number(healthResult.rows[0]?.open_circuits || 0);
  const maxConsecutiveFailures = Number(healthResult.rows[0]?.max_consecutive_failures || 0);
  const pendingOperations = Number(pendingResult.rows[0]?.count || 0);
  const staleOperations = Number(staleResult.rows[0]?.count || 0);
  const latestStatus = latestRecon.rows[0]?.status || 'None';

  const mappingOk = provider.adapter_key === 'synthetic' ? activeRoutes > 0 : activeRoutes > 0 && mappedRoutes === activeRoutes;
  const reconciliationOk = pendingOperations === 0 && staleOperations === 0 && latestStatus !== 'Running' && latestStatus !== 'Failed';
  const routeHealthOk = openCircuits === 0 && maxConsecutiveFailures === 0;

  const qualificationStatus = qualificationProvider?.status || 'missing';
  const catalogOk = provider.adapter_key === 'synthetic' || qualificationStatus === 'catalog_verified';
  const catalogCount = Number(qualificationProvider?.catalogCount || (provider.adapter_key === 'synthetic' ? catalogServices.length : 0));
  const verifiedMappings = Number(qualificationProvider?.verifiedMappings || 0);

  const lifecycleCanary = provider.adapter_key === 'synthetic'
    ? await runSyntheticLifecycleCanary().then(value => ({ status: 'passed', evidence: value })).catch(error => ({ status: 'failed', evidence: null, error: String(error?.message || 'Synthetic canary failed').slice(0,300) }))
    : { status: 'not_run', evidence: null, error: null };

  let health = { healthy: false, configured: configuredFor(provider) };
  try {
    if (!configuredFor(provider)) {
      health = { healthy: false, configured: false };
    } else {
      health = await getProviderAdapter(provider.adapter_key).health();
    }
  } catch (error) {
    health = {
      healthy: false,
      configured: configuredFor(provider),
      error: String(error?.code || error?.message || 'Provider health check failed').slice(0,160),
    };
  }

  const capabilities = providerCapabilities(getProviderAdapter(provider.adapter_key));
  const credentialsOk = configuredFor(provider);
  const healthOk = health?.healthy === true && (provider.adapter_key === 'synthetic' || health?.configured !== false);
  const cancellationOk = capabilities.cancelActivation === true;
  const routingGateOk = provider.adapter_key === 'synthetic'
    ? true
    : externalRoutingEnabled() && (cancellationOk || nonCancellableReserveAllowed());
  const canaryOk = lifecycleCanary.status === 'passed';

  const blockers = [];
  if (!credentialsOk) blockers.push({ code: 'CREDENTIALS_REQUIRED', message: 'Server-side provider credentials are not configured' });
  if (!healthOk) blockers.push({ code: 'PROVIDER_HEALTH_FAILED', message: 'Provider health check did not pass' });
  if (!catalogOk) blockers.push({ code: 'PROVIDER_CATALOG_NOT_VERIFIED', message: 'Live India provider catalog is not verified' });
  if (!cancellationOk) blockers.push({ code: 'PROVIDER_CANCELLATION_REQUIRED', message: 'Deterministic provider cancellation is required for live reserve routing' });
  if (!routingGateOk) blockers.push({ code: 'EXTERNAL_ROUTING_DISABLED', message: 'External routing is disabled in the production configuration' });
  if (!mappingOk) blockers.push({ code: 'ACTIVE_ROUTE_MAPPING_REQUIRED', message: 'Every active route for this provider must have a verified provider-service mapping and at least one active route' });
  if (!reconciliationOk) blockers.push({ code: 'RECONCILIATION_NOT_CLEAR', message: 'Pending, stale, running, or failed provider reconciliation work exists' });
  if (!routeHealthOk) blockers.push({ code: 'PROVIDER_ROUTE_UNHEALTHY', message: 'Provider route circuits or consecutive failures require recovery' });
  if (!canaryOk) blockers.push({ code: 'LIFECYCLE_CANARY_REQUIRED', message: 'A successful lifecycle canary is required before external activation' });

  return {
    providerId: provider.id,
    name: provider.name,
    adapterKey: provider.adapter_key,
    active: Boolean(provider.active),
    priority: Number(provider.priority),
    status: blockers.length ? 'blocked' : 'ready',
    checkedAt: Date.now(),
    healthOk,
    credentialsOk,
    catalogOk,
    cancellationOk,
    routingGateOk,
    mappingOk,
    reconciliationOk,
    routeHealthOk,
    canaryStatus: lifecycleCanary.status,
    blockers,
    details: {
      activeRoutes,
      mappedRoutes,
      unmappedRoutes: Math.max(0, activeRoutes - mappedRoutes),
      catalogCount,
      verifiedMappings,
      pendingOperations,
      staleOperations,
      openCircuits,
      maxConsecutiveFailures,
      latestReconciliationStatus: latestStatus,
      latestReconciliationStartedAt: latestRecon.rows[0]?.started_at ? new Date(latestRecon.rows[0].started_at).getTime() : null,
      latestReconciliationCompletedAt: latestRecon.rows[0]?.completed_at ? new Date(latestRecon.rows[0].completed_at).getTime() : null,
      providerHealth: {
        configured: health?.configured ?? credentialsOk,
        healthy: Boolean(health?.healthy),
        balance: health?.balance ?? null,
        currency: health?.currency ?? null,
        checkedAt: health?.checkedAt ?? null,
      },
      capabilities,
      globalExternalRoutingEnabled: externalRoutingEnabled(),
      nonCancellableReserveAllowed: nonCancellableReserveAllowed(),
      lifecycleCanaryEvidence: lifecycleCanary.evidence,
      lifecycleCanaryError: lifecycleCanary.error,
    },
  };
}

async function persistSnapshot(pool, row) {
  await pool.query(
    "INSERT INTO provider_production_readiness (provider_id,status,checked_at,health_ok,credentials_ok,catalog_ok,cancellation_ok,routing_gate_ok,mapping_ok,reconciliation_ok,route_health_ok,canary_status,blockers,details) VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb) ON CONFLICT (provider_id) DO UPDATE SET status=EXCLUDED.status,checked_at=EXCLUDED.checked_at,health_ok=EXCLUDED.health_ok,credentials_ok=EXCLUDED.credentials_ok,catalog_ok=EXCLUDED.catalog_ok,cancellation_ok=EXCLUDED.cancellation_ok,routing_gate_ok=EXCLUDED.routing_gate_ok,mapping_ok=EXCLUDED.mapping_ok,reconciliation_ok=EXCLUDED.reconciliation_ok,route_health_ok=EXCLUDED.route_health_ok,canary_status=EXCLUDED.canary_status,blockers=EXCLUDED.blockers,details=EXCLUDED.details",
    [row.providerId,row.status,row.healthOk,row.credentialsOk,row.catalogOk,row.cancellationOk,row.routingGateOk,row.mappingOk,row.reconciliationOk,row.routeHealthOk,row.canaryStatus,JSON.stringify(row.blockers),JSON.stringify(row.details)],
  );
}

export async function getProviderProductionReadiness({ persist = true } = {}) {
  const pool = await getPool();
  if (!pool) throw new Error('Provider production readiness requires PostgreSQL');
  const qualification = await qualifyProviders();
  const providerResult = await pool.query("SELECT id,name,adapter_key,active,priority FROM providers ORDER BY priority,id");
  const qualificationById = new Map(qualification.providers.map(row => [row.id, row]));
  const providers = [];
  for (const provider of providerResult.rows) {
    const row = await providerRowChecks(pool, provider, qualificationById.get(provider.id));
    if (persist) await persistSnapshot(pool, row);
    providers.push(row);
  }
  return {
    generatedAt: Date.now(),
    externalRoutingEnabled: externalRoutingEnabled(),
    nonCancellableReserveAllowed: nonCancellableReserveAllowed(),
    providers,
    rules: {
      externalProvidersRequireCredentials: true,
      externalProvidersRequireLiveIndiaCatalog: true,
      externalProvidersRequireVerifiedActiveRouteMappings: true,
      externalProvidersRequireDeterministicCancellation: true,
      externalProvidersRequireReconciliationClear: true,
      externalProvidersRequireRouteHealthClear: true,
      externalProvidersRequireLifecycleCanary: true,
      publicSharedSourcesExcludedFromFulfillment: true,
      syntheticLifecycleCanaryIsNonBillable: true,
    },
  };
}

export async function setProviderProductionActive(adminUserId, providerId, active) {
  const targetId = String(providerId || '').trim();
  if (!targetId) throw Object.assign(new Error('Provider id is required'), { statusCode: 400 });
  const next = Boolean(active);

  if (next) {
    const readiness = await getProviderProductionReadiness({ persist: true });
    const target = readiness.providers.find(row => row.providerId === targetId);
    if (!target) throw Object.assign(new Error('Provider not found'), { statusCode: 404 });
    if (target.adapterKey === 'synthetic') {
      throw Object.assign(new Error('Synthetic provider is permanently enabled in the production safety lane'), { statusCode: 400 });
    }
    if (target.status !== 'ready') {
      const error = Object.assign(new Error('Provider is not production-ready'), { statusCode: 409 });
      error.code = 'PROVIDER_NOT_PRODUCTION_READY';
      error.blockers = target.blockers;
      throw error;
    }
  }

  return withTransaction(async client => {
    const current = await client.query("SELECT id,name,adapter_key,active,priority FROM providers WHERE id=$1 FOR UPDATE",[targetId]);
    if (!current.rowCount) throw Object.assign(new Error('Provider not found'), { statusCode: 404 });
    const row = current.rows[0];
    if (row.adapter_key === 'synthetic' && !next) {
      throw Object.assign(new Error('Synthetic provider cannot be disabled'), { statusCode: 400 });
    }
    if (Boolean(row.active) === next) return { providerId: row.id, active: next, changed: false };
    const updated = await client.query("UPDATE providers SET active=$2,updated_at=NOW() WHERE id=$1 RETURNING id,name,adapter_key,active,priority",[row.id,next]);
    await recordAuditTx(client, adminUserId, next ? 'provider.production_activated' : 'provider.production_deactivated', 'provider', row.id, {
      adapterKey: row.adapter_key,
      beforeActive: Boolean(row.active),
      afterActive: next,
    });
    return { providerId: updated.rows[0].id, active: Boolean(updated.rows[0].active), changed: true };
  });
}
