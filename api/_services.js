import { applySecurityHeaders, requestId, rateLimitAsync } from './_lib/security.js';
import { services as localServices } from './_lib/catalog.js';
import { listPersistedServices } from './_lib/service-repository.js';
import { getPool } from './_lib/db.js';
import { isProduction, isSyntheticProduction } from './_lib/runtime-config.js';


export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'services-list', 120, 60_000)) return;

  const persisted = await listPersistedServices();
  if (!persisted && isProduction() && !isSyntheticProduction()) {
    return res.status(503).json({ error: 'Service catalog database is not configured' });
  }

  const sourceServices = persisted ?? localServices;
  let purchasableIds = null;
  if (isProduction()) {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ error: 'Service fulfillment database is not configured' });
    const result = await pool.query(
      `SELECT DISTINCT r.service_id
         FROM service_provider_routes r
         JOIN providers p ON p.id=r.provider_id
        WHERE r.active=TRUE AND p.active=TRUE AND p.adapter_key <> 'synthetic'`
    );
    purchasableIds = new Set(result.rows.map((row) => String(row.service_id)));
  }
  const services = sourceServices.map((service) => ({
    ...service,
    purchasable: purchasableIds ? purchasableIds.has(String(service.id)) : true
  }));
  res.status(200).json({
    country: 'IN',
    currency: 'INR',
    services,
  });
}
