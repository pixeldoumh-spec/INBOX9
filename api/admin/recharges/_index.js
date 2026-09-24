import { applySecurityHeaders, requestId, rateLimitAsync } from '../../_lib/security.js';
import { dbEnabled } from '../../_lib/db.js';
import { getSessionUser, getMockSession, requireUser } from '../../_lib/auth.js';
import { listPendingRecharges } from '../../_lib/wallet-repository.js';
import { listPendingMockRecharges } from '../../_lib/mock.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'admin-recharges', 30, 60_000)) return;
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  if (!dbEnabled()) return res.status(200).json({ recharges: listPendingMockRecharges(), persistent: false });
  try { return res.status(200).json({ recharges: await listPendingRecharges(), persistent: true }); }
  catch (error) { return res.status(503).json({ error: 'Admin recharge queue unavailable' }); }
}
