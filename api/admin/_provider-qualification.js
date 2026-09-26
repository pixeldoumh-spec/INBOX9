import { applySecurityHeaders, rateLimitAsync, requestId } from '../_lib/security.js';
import { dbEnabled, getPool } from '../_lib/db.js';
import { getSessionUser, requireAdmin } from '../_lib/auth.js';
import { qualifyProviders, verifyAndSaveProviderMapping, verifyAndSaveExactProviderMappings } from '../_lib/provider-qualification.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (!['GET', 'POST'].includes(req.method || 'GET')) return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'admin-provider-qualification', req.method === 'POST' ? 10 : 20, 60_000)) return;
  if (!dbEnabled()) return res.status(503).json({ error: 'Provider qualification requires PostgreSQL' });
  const user = await getSessionUser(req);
  try { requireAdmin(user); } catch (error) { return res.status(error.statusCode || 401).json({ error: error.message }); }

  try {
    if (req.method === 'GET') return res.status(200).json(await qualifyProviders());
    const body = req.body || {};
    if (body.action === 'verify-exact-candidates') {
      const result = await verifyAndSaveExactProviderMappings(user.id, body);
      return res.status(200).json(result);
    }
    if (body.action !== 'verify-mapping') return res.status(400).json({ error: 'Unsupported qualification action' });
    const result = await verifyAndSaveProviderMapping(user.id, body);
    return res.status(200).json(result);
  } catch (error) {
    console.error('admin.provider_qualification_failed', error);
    const status = Number(error?.statusCode) || (error?.code === 'PROVIDER_NOT_CONFIGURED' ? 503 : ['PROVIDER_SERVICE_CODE_NOT_FOUND','PROVIDER_EXACT_MAPPING_INCOMPLETE','PROVIDER_CATALOG_NOT_VERIFIED','ACTIVE_SERVICE_CATALOG_MISMATCH'].includes(error?.code) ? 409 : 500);
    return res.status(status).json({ error: String(error?.message || 'Provider qualification failed').slice(0, 300), code: error?.code || 'PROVIDER_QUALIFICATION_FAILED' });
  }
}