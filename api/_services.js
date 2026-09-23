import { applySecurityHeaders, requestId, rateLimitAsync } from './_lib/security.js';
import { services as localServices } from './_lib/catalog.js';
import { listPersistedServices } from './_lib/service-repository.js';
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
  res.status(200).json({ country: 'IN', currency: 'INR', services: persisted ?? localServices });
}
