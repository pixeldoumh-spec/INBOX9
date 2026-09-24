import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../../_lib/security.js';
import { dbEnabled } from '../../_lib/db.js';
import { getSessionUser, requireAdmin } from '../../_lib/auth.js';
import { updateAdminSupportTicket } from '../../_lib/support-repository.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'admin-support-update', 60, 60_000) || !enforceSameOrigin(req, res)) return;
  try { validateBodySize(req, 8_000); } catch (e) { return res.status(413).json({ error: e.message }); }
  if (!dbEnabled()) return res.status(503).json({ error: 'Admin support updates require PostgreSQL' });
  const user = await getSessionUser(req);
  try { requireAdmin(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }
  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: 'Support ticket id is required' });
  try {
    const ticket = await updateAdminSupportTicket(user.id, id, req.body || {});
    return res.status(200).json({ ticket });
  } catch (error) {
    const status = Number(error?.statusCode);
    if (status >= 400 && status < 500) return res.status(status).json({ error: error.message });
    if (/Choose a valid support status|Support note must be/.test(String(error.message || ''))) {
      return res.status(400).json({ error: error.message });
    }
    console.error('admin.support_update_failed', error);
    return res.status(503).json({ error: 'Support update unavailable' });
  }
}
