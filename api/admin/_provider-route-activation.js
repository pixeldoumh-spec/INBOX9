import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, requireAdmin } from '../_lib/auth.js';
import { listExternalRouteActivationState, preflightExternalRouteActivation, setExternalRouteActive } from '../_lib/provider-route-activation.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (!['GET', 'POST'].includes(req.method || 'GET')) return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'admin-provider-route-activation', req.method === 'POST' ? 10 : 20, 60_000)) return;
  if (req.method === 'POST' && !enforceSameOrigin(req, res)) return;
  if (req.method === 'POST') {
    try { validateBodySize(req); } catch (error) { return res.status(413).json({ error: error.message }); }
  }
  if (!dbEnabled()) return res.status(503).json({ error: 'Provider route activation requires PostgreSQL' });

  const user = await getSessionUser(req);
  try { requireAdmin(user); } catch (error) { return res.status(error.statusCode || 401).json({ error: error.message }); }

  try {
    if (req.method === 'GET') {
      const providerId = String(req.query?.providerId || '').trim() || null;
      const serviceId = String(req.query?.serviceId || '').trim() || null;
      if (providerId && serviceId) {
        return res.status(200).json(await preflightExternalRouteActivation({ providerId, serviceId }));
      }
      return res.status(200).json({
        externalRoutingEnabled: String(process.env.INBOX9_ENABLE_EXTERNAL_ROUTING || '').trim().toLowerCase() === 'true',
        routes: await listExternalRouteActivationState({ providerId, serviceId }),
      });
    }

    const body = req.body || {};
    const action = String(body.action || '').trim();
    if (action === 'preflight') {
      return res.status(200).json(await preflightExternalRouteActivation({ providerId: body.providerId, serviceId: body.serviceId }));
    }
    if (action === 'activate' || action === 'deactivate') {
      return res.status(200).json(await setExternalRouteActive(user.id, {
        providerId: body.providerId,
        serviceId: body.serviceId,
        active: action === 'activate',
        priority: body.priority,
      }));
    }
    return res.status(400).json({ error: 'Unsupported provider route activation action' });
  } catch (error) {
    console.error('admin.provider_route_activation_failed', error);
    const blocked = new Set([
      'EXTERNAL_ROUTE_ACTIVATION_BLOCKED',
      'EXTERNAL_ROUTING_DISABLED',
      'PROVIDER_SERVICE_MAPPING_REQUIRED',
      'LIFECYCLE_CERTIFICATION_REQUIRED',
      'LIFECYCLE_CERTIFICATION_STALE',
      'LIFECYCLE_CERTIFICATION_SERVICE_MISMATCH',
      'LIFECYCLE_CERTIFICATION_MAPPING_MISMATCH',
      'LIFECYCLE_CLEANUP_NOT_CLEAR',
      'PROVIDER_CANCELLATION_REQUIRED',
      'CREDENTIALS_REQUIRED',
      'PROVIDER_CATALOG_NOT_VERIFIED',
    ]);
    const notFound = new Set(['PROVIDER_NOT_FOUND', 'SERVICE_NOT_FOUND', 'ROUTE_TARGET_NOT_FOUND']);
    const status = Number(error?.statusCode) || (notFound.has(error?.code) ? 404 : blocked.has(error?.code) ? 409 : 500);
    return res.status(status).json({
      error: String(error?.message || 'Provider route activation failed').slice(0, 300),
      code: error?.code || 'PROVIDER_ROUTE_ACTIVATION_FAILED',
      blockers: Array.isArray(error?.blockers) ? error.blockers : undefined,
    });
  }
}
