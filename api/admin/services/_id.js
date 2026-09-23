import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../../_lib/security.js';
import { dbEnabled } from '../../_lib/db.js';
import { getSessionUser, requireAdmin } from '../../_lib/auth.js';
import { updateService } from '../../_lib/admin-repository.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'admin-service-update', 60, 60_000) || !enforceSameOrigin(req, res)) return;
  try { validateBodySize(req); } catch (e) { return res.status(413).json({ error: e.message }); }
  if (!dbEnabled()) return res.status(503).json({ error: 'Admin service updates require PostgreSQL' });
  const user = await getSessionUser(req);
  try { requireAdmin(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }
  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: 'Service id is required' });
  try {
    const service = await updateService(user.id, id, req.body || {});
    return res.status(200).json({ service });
  } catch (error) {
    console.error('admin.service_update_failed', error);
    return res.status(error.message === 'Service not found' ? 404 : 400).json({ error: error.message });
  }
}
