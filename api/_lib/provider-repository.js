import { getPool } from './db.js';
import { getProviderAdapter } from './provider-registry.js';

export async function selectProviderForService(client, serviceId) {
  const result = await client.query(
    `SELECT p.id,p.name,p.adapter_key,p.priority
     FROM service_provider_routes r
     JOIN providers p ON p.id=r.provider_id
     WHERE r.service_id=$1 AND r.active=TRUE AND p.active=TRUE
     ORDER BY r.priority ASC, p.priority ASC, p.id ASC
     LIMIT 1`,
    [serviceId]
  );
  if (!result.rowCount) {
    const error = new Error('No active provider is configured for this service');
    error.code = 'NO_PROVIDER';
    throw error;
  }
  return result.rows[0];
}

export async function listProviders() {
  const pool = await getPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT p.id,p.name,p.adapter_key,p.active,p.priority,
            COUNT(r.service_id)::int AS routed_services
     FROM providers p LEFT JOIN service_provider_routes r ON r.provider_id=p.id AND r.active=TRUE
     GROUP BY p.id ORDER BY p.priority,p.id`
  );
  return result.rows.map(row => ({
    id: row.id, name: row.name, adapterKey: row.adapter_key,
    active: row.active, priority: row.priority, routedServices: row.routed_services,
  }));
}

export async function providerHealth() {
  const pool = await getPool();
  if (!pool) return [];
  const result = await pool.query(`SELECT id,name,adapter_key,active FROM providers WHERE active=TRUE ORDER BY priority,id`);
  const checks = await Promise.all(result.rows.map(async row => {
    try {
      const health = await getProviderAdapter(row.adapter_key).health();
      return { id: row.id, name: row.name, adapterKey: row.adapter_key, ...health };
    } catch (error) {
      return { id: row.id, name: row.name, adapterKey: row.adapter_key, healthy: false, error: 'Provider health check failed' };
    }
  }));
  return checks;
}
