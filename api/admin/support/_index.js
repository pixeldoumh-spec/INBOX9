import { applySecurityHeaders, requestId, rateLimitAsync } from '../../_lib/security.js';
import { dbEnabled } from '../../_lib/db.js';
import { getSessionUser, requireAdmin } from '../../_lib/auth.js';
import { listAdminSupportTickets } from '../../_lib/support-repository.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'admin-support', 30, 60_000)) return;
  if (!dbEnabled()) return res.status(503).json({ error: 'Admin support requires PostgreSQL' });
  const user = await getSessionUser(req);
  try { requireAdmin(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }
  try {
    return res.status(200).json({ tickets: await listAdminSupportTickets(req.query?.limit) });
  } catch (error) {
    console.error('admin.support_failed', error);
    return res.status(503).json({ error: 'Support queue unavailable' });
  }
}
