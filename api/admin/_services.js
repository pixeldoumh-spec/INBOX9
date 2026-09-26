import { applySecurityHeaders, requestId, rateLimitAsync } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, requireAdmin } from '../_lib/auth.js';
import { listAdminServices } from '../_lib/admin-repository.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'admin-services', 30, 60_000)) return;
  if (!dbEnabled()) return res.status(503).json({ error: 'Admin services require PostgreSQL' });
  const user = await getSessionUser(req);
  try { requireAdmin(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }
  try { return res.status(200).json({ services: await listAdminServices({ query: req.query?.q, status: req.query?.status, limit: req.query?.limit, offset: req.query?.offset }) }); }
  catch (error) { console.error('admin.services_failed', error); return res.status(503).json({ error: 'Services unavailable' }); }
}
