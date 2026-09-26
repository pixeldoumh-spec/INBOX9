import crypto from 'node:crypto';
import { services as catalogServices } from './catalog.js';
import { getPool } from './db.js';
import { getProviderAdapter } from './provider-registry.js';

const CREDENTIAL_ENV = Object.freeze({
  asms: 'INBOX9_ASMS_API_KEY',
  pvapins: 'INBOX9_PVAPINS_API_KEY',
  'sms-verification-number': 'INBOX9_SVNUMBER_API_KEY',
});

function normalized(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function providerCatalogRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.services)) return value.services;
  return [];
}

function serviceIdentity(row) {
  return String(row?.code ?? row?.id ?? row?.service ?? row?.name ?? '').trim();
}

function serviceLabel(row) {
  return String(row?.name ?? row?.label ?? row?.serviceName ?? row?.service ?? serviceIdentity(row)).trim();
}

function serviceCatalogByName(rows) {
  const map = new Map();
  for (const row of rows) {
    const label = normalized(serviceLabel(row));
    if (!label) continue;
    const list = map.get(label) || [];
    list.push({ code: serviceIdentity(row), name: serviceLabel(row), price: row?.price ?? null, stock: row?.stock ?? row?.quantity ?? row?.count ?? null });
    map.set(label, list);
  }
  return map;
}

async function liveCatalogForProvider(provider) {
  const envName = CREDENTIAL_ENV[provider.adapter_key];
  if (!envName || !String(process.env[envName] || '').trim()) {
    return { status: 'credentials_required', configured: false, services: [], error: null, checkedAt: Date.now() };
  }
  try {
    const adapter = getProviderAdapter(provider.adapter_key);
    const raw = await adapter.listServices({ country: 'IN' });
    const services = providerCatalogRows(raw);
    return { status: 'catalog_verified', configured: true, services, error: null, checkedAt: Date.now() };
  } catch (error) {
    return { status: 'catalog_unavailable', configured: true, services: [], error: String(error?.code || error?.message || 'Provider catalog unavailable').slice(0, 160), checkedAt: Date.now() };
  }
}

export async function qualifyProviders() {
  const pool = await getPool();
  if (!pool) throw new Error('Provider qualification requires PostgreSQL');
  const providerResult = await pool.query(
    `SELECT id,name,adapter_key,active,priority FROM providers ORDER BY priority,id`
  );
  const mappingResult = await pool.query(
    `SELECT provider_id,service_id,provider_service_code,active FROM provider_service_mappings`
  );
  const mappings = new Map(mappingResult.rows.map(row => [row.provider_id + '::' + row.service_id, row]));
  const externalProviders = providerResult.rows.filter(row => row.adapter_key !== 'synthetic');
  const liveCatalogs = new Map();
  for (const provider of externalProviders) liveCatalogs.set(provider.id, await liveCatalogForProvider(provider));

  const providers = providerResult.rows.map(provider => {
    if (provider.adapter_key === 'synthetic') {
      return { id: provider.id, name: provider.name, adapterKey: provider.adapter_key, active: Boolean(provider.active), priority: Number(provider.priority), status: 'live_internal', configured: true, catalogCount: catalogServices.length, verifiedMappings: catalogServices.length, candidateMappings: 0, staleMappings: 0, error: null };
    }
    const catalog = liveCatalogs.get(provider.id);
    const rows = providerCatalogRows(catalog?.services);
    const mappingRows = mappingResult.rows.filter(row => row.provider_id === provider.id && row.active);
    const liveCodes = new Set(rows.map(serviceIdentity).filter(Boolean).map(String));
    const verifiedMappings = mappingRows.filter(row => liveCodes.has(String(row.provider_service_code))).length;
    return { id: provider.id, name: provider.name, adapterKey: provider.adapter_key, active: Boolean(provider.active), priority: Number(provider.priority), status: catalog.status, configured: catalog.configured, catalogCount: rows.length, verifiedMappings, candidateMappings: 0, staleMappings: mappingRows.filter(row => catalog.status === 'catalog_verified' && !liveCodes.has(String(row.provider_service_code))).length, error: catalog.error };
  });

  const serviceRows = catalogServices.map(service => {
    const qualification = {};
    for (const provider of providerResult.rows) {
      if (provider.adapter_key === 'synthetic') {
        qualification[provider.adapter_key] = { status: provider.active ? 'live' : 'provider_inactive', mapping: null, candidate: null };
        continue;
      }
      const catalog = liveCatalogs.get(provider.id);
      const rows = providerCatalogRows(catalog?.services);
      const byName = serviceCatalogByName(rows);
      const mapping = mappings.get(provider.id + '::' + service.id) || null;
      if (catalog.status === 'credentials_required') {
        qualification[provider.adapter_key] = { status: 'credentials_required', mapping: mapping?.provider_service_code || null, candidate: null };
        continue;
      }
      if (catalog.status !== 'catalog_verified') {
        qualification[provider.adapter_key] = { status: 'catalog_unavailable', mapping: mapping?.provider_service_code || null, candidate: null, error: catalog.error };
        continue;
      }
      const candidates = byName.get(normalized(service.name)) || [];
      const candidate = candidates.length === 1 ? candidates[0] : null;
      let status = 'unmapped';
      if (mapping) status = rows.some(row => serviceIdentity(row) === String(mapping.provider_service_code)) ? 'mapped_verified' : 'mapping_stale';
      else if (candidate) status = 'exact_name_candidate';
      else if (candidates.length > 1) status = 'ambiguous_name';
      qualification[provider.adapter_key] = { status, mapping: mapping?.provider_service_code || null, candidate: candidate?.code || null, candidateName: candidate?.name || null };
    }
    return { id: service.id, name: service.name, country: service.country, currency: service.currency, pricePaise: service.pricePaise, providers: qualification };
  });

  return {
    generatedAt: Date.now(),
    activeServiceCount: catalogServices.length,
    providers,
    services: serviceRows,
    rules: { externalMappingsMustMatchLiveProviderCode: true, externalRoutesRemainInactiveUntilQualified: true, publicSharedSourcesExcluded: true },
  };
}

export async function verifyAndSaveProviderMapping(adminUserId, { providerId, serviceId, providerServiceCode }) {
  const pool = await getPool();
  const provider = await pool.query('SELECT id,name,adapter_key,active FROM providers WHERE id=$1', [providerId]);
  const service = await pool.query('SELECT id,name,active FROM services WHERE id=$1', [serviceId]);
  if (!provider.rowCount) throw Object.assign(new Error('Provider not found'), { statusCode: 404 });
  if (!service.rowCount) throw Object.assign(new Error('Service not found'), { statusCode: 404 });
  const providerRow = provider.rows[0];
  if (providerRow.adapter_key === 'synthetic') throw new Error('Synthetic services do not require external mappings');
  const code = String(providerServiceCode || '').trim();
  if (!code) throw new Error('Provider service code is required');
  const envName = CREDENTIAL_ENV[providerRow.adapter_key];
  if (!envName || !String(process.env[envName] || '').trim()) throw Object.assign(new Error('Provider credentials are required before saving a verified mapping'), { code: 'PROVIDER_NOT_CONFIGURED' });
  const raw = await getProviderAdapter(providerRow.adapter_key).listServices({ country: 'IN' });
  const rows = providerCatalogRows(raw);
  const match = rows.find(row => serviceIdentity(row) === code);
  if (!match) throw Object.assign(new Error('Provider service code was not found in the live provider catalog'), { code: 'PROVIDER_SERVICE_CODE_NOT_FOUND' });
  await pool.query(
    `INSERT INTO provider_service_mappings(provider_id,service_id,provider_service_code,active,created_at,updated_at)
     VALUES ($1,$2,$3,TRUE,NOW(),NOW())
     ON CONFLICT (provider_id,service_id) DO UPDATE SET provider_service_code=EXCLUDED.provider_service_code,active=TRUE,updated_at=NOW()`,
    [providerId, serviceId, code]
  );
  await pool.query(
    `INSERT INTO audit_logs(id,actor_user_id,action,target_type,target_id,metadata)
     VALUES ($1,$2,'provider.service_mapping_verified','provider_service_mapping',$3,$4::jsonb)`,
    [crypto.randomUUID(), adminUserId, providerId + '::' + serviceId, JSON.stringify({ providerId, serviceId, providerServiceCode: code, providerServiceName: serviceLabel(match), country: 'IN' })]
  );
  return { providerId, serviceId, providerServiceCode: code, providerServiceName: serviceLabel(match), verified: true };
}