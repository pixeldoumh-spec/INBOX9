import { applySecurityHeaders, rateLimitAsync, requestId } from '../_lib/security.js';
import { dbEnabled, getPool } from '../_lib/db.js';
import { getSessionUser, requireAdmin } from '../_lib/auth.js';
import {
  latestSuccessfulLifecycleCertification,
  listLifecycleCertifications,
  preflightExternalLifecycleCertification,
  runExternalLifecycleCertification,
  runSyntheticLifecycleCertification,
} from '../_lib/provider-lifecycle-certification.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (!['GET', 'POST'].includes(req.method || 'GET')) return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'admin-provider-lifecycle-certification', req.method === 'POST' ? 5 : 20, 60_000)) return;
  if (!dbEnabled()) return res.status(503).json({ error: 'Provider lifecycle certification requires PostgreSQL' });

  const user = await getSessionUser(req);
  try { requireAdmin(user); } catch (error) { return res.status(error.statusCode || 401).json({ error: error.message }); }

  try {
    if (req.method === 'GET') {
      const providerId = String(req.query?.providerId || '').trim() || null;
      const serviceId = String(req.query?.serviceId || '').trim() || null;
      if (providerId && serviceId) return res.status(200).json(await preflightExternalLifecycleCertification({ providerId, serviceId }));
      const rows = await listLifecycleCertifications({ providerId, limit: req.query?.limit });
      return res.status(200).json({ certifications: rows });
    }

    const body = req.body || {};
    if (body.action === 'preflight') {
      return res.status(200).json(await preflightExternalLifecycleCertification({ providerId: body.providerId, serviceId: body.serviceId }));
    }
    if (body.action === 'synthetic-canary') {
      return res.status(200).json(await runSyntheticLifecycleCertification(user.id));
    }
    if (body.action === 'external-canary') {
      return res.status(200).json(await runExternalLifecycleCertification(user.id, {
        providerId: body.providerId,
        serviceId: body.serviceId,
        confirmation: body.confirmation,
      }));
    }
    if (body.action === 'latest-success') {
      const result = await latestSuccessfulLifecycleCertification(body.providerId);
      return res.status(200).json({ certification: result });
    }
    return res.status(400).json({ error: 'Unsupported lifecycle certification action' });
  } catch (error) {
    console.error('admin.provider_lifecycle_certification_failed', error);
    const code = error?.code || 'PROVIDER_LIFECYCLE_CERTIFICATION_FAILED';
    const status = Number(error?.statusCode) || (code === 'PROVIDER_NOT_FOUND' || code === 'SERVICE_NOT_FOUND' ? 404 : 500);
    return res.status(status).json({
      error: String(error?.message || 'Provider lifecycle certification failed').slice(0, 300),
      code,
      blockers: error?.blockers || undefined,
    });
  }
}
