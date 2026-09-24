import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, getMockSession, requireUser } from '../_lib/auth.js';
import { getPaymentReconciliationSummary, listFlaggedRecharges } from '../_lib/wallet-repository.js';

export default async function handler(req, res) {
  applySecurityHeaders(res); requestId(req, res);
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  if (!dbEnabled()) return res.status(503).json({ error: 'Payment reconciliation requires PostgreSQL' });
  if (!await rateLimitAsync(req, res, 'admin-payment-reconciliation', 30, 60_000) || !enforceSameOrigin(req, res)) return;
  try {
    const summary = await getPaymentReconciliationSummary({ from: req.query?.from, to: req.query?.to });
    const flagged = await listFlaggedRecharges(Number(req.query?.limit || 100));
    return res.status(200).json({ summary, flagged, generatedAt: Date.now() });
  } catch (error) { return res.status(503).json({ error: 'Payment reconciliation unavailable' }); }
}
