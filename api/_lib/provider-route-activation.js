import { getPool, withTransaction } from './db.js';
import { getProviderAdapter } from './provider-registry.js';
import { providerCapabilities } from './provider-gateway.js';
import { externalRoutingEnabled, nonCancellableReserveAllowed } from './provider-routing.js';
import { qualifyProviders } from './provider-qualification.js';
import { latestSuccessfulLifecycleCertification } from './provider-lifecycle-certification.js';
import { recordAuditTx } from './admin-repository.js';

const CREDENTIAL_ENV = Object.freeze({ asms: 'INBOX9_ASMS_API_KEY', pvapins: 'INBOX9_PVAPINS_API_KEY', 'sms-verification-number': 'INBOX9_SVNUMBER_API_KEY' });

function configured(provider) {
  const env = CREDENTIAL_ENV[provider.adapterKey];
  return Boolean(env && String(process.env[env] || '').trim());
}

export function lifecycleCertificationMaxAgeMs() {
  const value = Number(process.env.INBOX9_PROVIDER_CERT_MAX_AGE_MS);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.max(Math.trunc(value), 60000), 7 * 24 * 60 * 60 * 1000) : 24 * 60 * 60 * 1000;
}

export async function preflightExternalRouteActivation({ providerId, serviceId }) {
  const snapshot = await qualifyProviders();
  const provider = snapshot.providers.find(row => row.id === String(providerId));
  const service = snapshot.services.find(row => row.id === String(serviceId));
  if (!provider) throw Object.assign(new Error('Provider not found'), { code: 'PROVIDER_NOT_FOUND', statusCode: 404 });
  if (!service) throw Object.assign(new Error('Service not found'), { code: 'SERVICE_NOT_FOUND', statusCode: 404 });
  const blockers = [];
  if (provider.adapterKey === 'synthetic') blockers.push({ code: 'SYNTHETIC_ROUTE_USE_EXISTING_LANE', message: 'Synthetic routing is managed by the permanent safety lane' });
  if (!externalRoutingEnabled()) blockers.push({ code: 'EXTERNAL_ROUTING_DISABLED', message: 'External routing is disabled in the production configuration' });
  if (!configured(provider)) blockers.push({ code: 'CREDENTIALS_REQUIRED', message: 'Server-side provider credentials are not configured' });
  if (provider.status !== 'catalog_verified') blockers.push({ code: 'PROVIDER_CATALOG_NOT_VERIFIED', message: 'Live India provider catalog is not verified' });
  const serviceQualification = service.providers?.[provider.adapterKey] || null;
  if (serviceQualification?.status !== 'mapped_verified') blockers.push({ code: 'PROVIDER_SERVICE_MAPPING_REQUIRED', message: 'The selected service is not mapped to a verified live provider service code' });
  const adapter = provider.adapterKey === 'synthetic' ? null : getProviderAdapter(provider.adapterKey);
  const capabilities = adapter ? providerCapabilities(adapter) : {};
  if (adapter && configured(provider)) {
    try {
      const health = await adapter.health();
      if (health?.healthy !== true) blockers.push({ code: 'PROVIDER_HEALTH_FAILED', message: 'Current provider health check did not pass' });
    } catch (error) {
      blockers.push({ code: String(error?.code || 'PROVIDER_HEALTH_FAILED'), message: String(error?.message || 'Current provider health check failed').slice(0, 300) });
    }
  }
  if (provider.adapterKey !== 'synthetic' && capabilities.cancelActivation !== true && !nonCancellableReserveAllowed()) blockers.push({ code: 'PROVIDER_CANCELLATION_REQUIRED', message: 'Deterministic provider cancellation is required for live route activation' });
  const certification = provider.adapterKey === 'synthetic' ? null : await latestSuccessfulLifecycleCertification(provider.id);
  if (!certification) blockers.push({ code: 'LIFECYCLE_CERTIFICATION_REQUIRED', message: 'A successful lifecycle certification is required for this provider' });
  else {
    if (Date.now() - certification.createdAt > lifecycleCertificationMaxAgeMs()) blockers.push({ code: 'LIFECYCLE_CERTIFICATION_STALE', message: 'The latest successful lifecycle certification is stale' });
    if (String(certification.serviceId) !== String(service.id)) blockers.push({ code: 'LIFECYCLE_CERTIFICATION_SERVICE_MISMATCH', message: 'Lifecycle certification belongs to a different service' });
    if (String(certification.providerServiceCode || '') !== String(serviceQualification?.mapping || '')) blockers.push({ code: 'LIFECYCLE_CERTIFICATION_MAPPING_MISMATCH', message: 'Lifecycle certification was run against a different provider service mapping' });
    if (!certification.cleanupOk || !certification.reconciliationOk) blockers.push({ code: 'LIFECYCLE_CLEANUP_NOT_CLEAR', message: 'Lifecycle certification did not finish with clean reconciliation and cleanup' });
  }
  return { providerId: provider.id, adapterKey: provider.adapterKey, providerName: provider.name, serviceId: service.id, serviceName: service.name, providerServiceCode: serviceQualification?.mapping || null, cancellationOk: capabilities.cancelActivation === true, nonCancellableReserveAllowed: nonCancellableReserveAllowed(), certificationId: certification?.certificationId || null, certificationCreatedAt: certification?.createdAt || null, certificationMaxAgeMs: lifecycleCertificationMaxAgeMs(), status: blockers.length ? 'blocked' : 'ready', blockers };
}

export async function setExternalRouteActive(adminUserId, { providerId, serviceId, active = true, priority = 100 }) {
  const next = Boolean(active);
  const providerKey = String(providerId || '').trim();
  const serviceKey = String(serviceId || '').trim();
  if (!providerKey || !serviceKey) throw Object.assign(new Error('Provider id and service id are required'), { code: 'ROUTE_IDENTIFIERS_REQUIRED', statusCode: 400 });
  if (next) {
    const preflight = await preflightExternalRouteActivation({ providerId: providerKey, serviceId: serviceKey });
    if (preflight.status !== 'ready') { const error = Object.assign(new Error('External route activation is blocked'), { code: 'EXTERNAL_ROUTE_ACTIVATION_BLOCKED', statusCode: 409 }); error.blockers = preflight.blockers; throw error; }
  }
  return withTransaction(async client => {
    const result = await client.query(      'SELECT p.id AS provider_id,p.name AS provider_name,p.adapter_key,p.active AS provider_active,s.id AS service_id,s.name AS service_name,s.active AS service_active,r.priority,r.active AS route_active,m.provider_service_code ' +      'FROM providers p JOIN services s ON s.id=$2 LEFT JOIN service_provider_routes r ON r.provider_id=p.id AND r.service_id=s.id LEFT JOIN provider_service_mappings m ON m.provider_id=p.id AND m.service_id=s.id AND m.active=TRUE WHERE p.id=$1 FOR UPDATE', [providerKey, serviceKey]);
    if (!result.rowCount) throw Object.assign(new Error('Provider or service not found'), { code: 'ROUTE_TARGET_NOT_FOUND', statusCode: 404 });
    const row = result.rows[0];
    if (row.adapter_key === 'synthetic') throw Object.assign(new Error('Synthetic route cannot be changed through external route controls'), { code: 'SYNTHETIC_ROUTE_IMMUTABLE', statusCode: 400 });
    if (!row.service_active) throw Object.assign(new Error('Inactive service cannot receive an external route'), { code: 'SERVICE_INACTIVE', statusCode: 409 });
    if (next) {
      const safePriority = Math.max(0, Math.min(Math.trunc(Number(priority) || 100), 10000));
      await client.query('UPDATE providers SET active=TRUE,updated_at=NOW() WHERE id=$1',[providerKey]);
      await client.query('INSERT INTO service_provider_routes(service_id,provider_id,priority,active) VALUES ($1,$2,$3,TRUE) ON CONFLICT (service_id,provider_id) DO UPDATE SET priority=EXCLUDED.priority,active=TRUE',[serviceKey,providerKey,safePriority]);
      await recordAuditTx(client, adminUserId, 'provider.route.production_activated', 'service_provider_route', providerKey + '::' + serviceKey, { providerId: providerKey, serviceId: serviceKey, providerServiceCode: row.provider_service_code, beforeProviderActive: Boolean(row.provider_active), afterProviderActive: true, beforeRouteActive: Boolean(row.route_active), afterRouteActive: true });
      return { providerId: providerKey, serviceId: serviceKey, active: true, providerActive: true, changed: !Boolean(row.route_active) || !Boolean(row.provider_active) };
    }
    if (!row.route_active) return { providerId: providerKey, serviceId: serviceKey, active: false, providerActive: Boolean(row.provider_active), changed: false };
    await client.query('UPDATE service_provider_routes SET active=FALSE WHERE provider_id=$1 AND service_id=$2',[providerKey,serviceKey]);
    await recordAuditTx(client, adminUserId, 'provider.route.production_deactivated', 'service_provider_route', providerKey + '::' + serviceKey, { providerId: providerKey, serviceId: serviceKey, beforeRouteActive: true, afterRouteActive: false, providerActive: Boolean(row.provider_active) });
    return { providerId: providerKey, serviceId: serviceKey, active: false, providerActive: Boolean(row.provider_active), changed: true };
  });
}

export async function listExternalRouteActivationState({ providerId = null, serviceId = null } = {}) {
  const pool = await getPool();
  const params = []; const where = ["p.adapter_key <> 'synthetic'"];
  if (providerId) { params.push(String(providerId)); where.push('p.id=$' + params.length); }
  if (serviceId) { params.push(String(serviceId)); where.push('s.id=$' + params.length); }
  const result = await pool.query('SELECT r.provider_id,r.service_id,p.name AS provider_name,p.adapter_key,p.active AS provider_active,s.name AS service_name,r.priority,r.active,m.provider_service_code FROM service_provider_routes r JOIN providers p ON p.id=r.provider_id JOIN services s ON s.id=r.service_id LEFT JOIN provider_service_mappings m ON m.provider_id=r.provider_id AND m.service_id=r.service_id AND m.active=TRUE WHERE ' + where.join(' AND ') + ' ORDER BY r.priority,p.priority,r.provider_id,r.service_id', params);
  return result.rows.map(row => ({ providerId: row.provider_id, serviceId: row.service_id, providerName: row.provider_name, adapterKey: row.adapter_key, providerActive: Boolean(row.provider_active), serviceName: row.service_name, priority: Number(row.priority), active: Boolean(row.active), providerServiceCode: row.provider_service_code || null }));
}
