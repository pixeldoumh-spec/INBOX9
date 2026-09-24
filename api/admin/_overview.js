import { applySecurityHeaders, requestId, rateLimitAsync } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, getMockSession, requireAdmin } from '../_lib/auth.js';
import { getAdminOverview } from '../_lib/admin-repository.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'admin-overview', 30, 60_000)) return;
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireAdmin(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }
  if (!dbEnabled()) {
    return res.status(200).json({ users: 0, activeActivations: 0, rechargeRequests: 0, pendingRechargePaise: 0, walletBalancePaise: 0, approvedRechargePaise: 0, totalDebitsPaise: 0, persistent: false });
  }
  try { return res.status(200).json(await getAdminOverview()); }
  catch (error) { console.error('admin.overview_failed', error); return res.status(503).json({ error: 'Admin overview unavailable' }); }
}
