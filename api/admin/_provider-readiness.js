import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, requireAdmin } from '../_lib/auth.js';
import { getProviderProductionReadiness, setProviderProductionActive } from '../_lib/provider-production-readiness.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (!['GET', 'POST'].includes(req.method || 'GET')) return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'admin-provider-readiness', req.method === 'POST' ? 10 : 20, 60_000)) return;
  if (req.method === 'POST' && !enforceSameOrigin(req, res)) return;
  if (req.method === 'POST') {
    try { validateBodySize(req); } catch (error) { return res.status(413).json({ error: error.message }); }
  }
  if (!dbEnabled()) return res.status(503).json({ error: 'Provider readiness requires PostgreSQL' });

  const user = await getSessionUser(req);
  try { requireAdmin(user); }
  catch (error) { return res.status(error.statusCode || 401).json({ error: error.message }); }

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await getProviderProductionReadiness({ persist: true }));
    }

    const body = req.body || {};
    const action = String(body.action || '').trim();
    if (action === 'refresh') {
      return res.status(200).json(await getProviderProductionReadiness({ persist: true }));
    }
    if (!['activate', 'deactivate'].includes(action)) {
      return res.status(400).json({ error: 'Unsupported provider readiness action' });
    }

    await setProviderProductionActive(user.id, body.providerId, action === 'activate');
    return res.status(200).json(await getProviderProductionReadiness({ persist: true }));
  } catch (error) {
    console.error('admin.provider_readiness_failed', error);
    const status = Number(error?.statusCode)
      || (error?.code === 'PROVIDER_NOT_PRODUCTION_READY' ? 409 : 500);
    return res.status(status).json({
      error: String(error?.message || 'Provider readiness operation failed').slice(0, 300),
      code: error?.code || 'PROVIDER_READINESS_FAILED',
      blockers: Array.isArray(error?.blockers) ? error.blockers : undefined,
    });
  }
}
