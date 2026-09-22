import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin } from '../../_lib/security.js';
import { dbEnabled } from '../../_lib/db.js';
import { getSessionUser, getMockSession, requireUser } from '../../_lib/auth.js';
import { reviewRecharge, flagRecharge, isDuplicateUtrError } from '../../_lib/wallet-repository.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  if (!await rateLimitAsync(req, res, 'admin-recharge', 60, 60_000) || !enforceSameOrigin(req, res)) return;
  if (!dbEnabled()) return res.status(503).json({ error: 'Admin recharge actions require PostgreSQL' });
  const id = req.query?.id || String(req.url || '').split('/').pop();
  const decision = String(req.body?.decision || '').toLowerCase();
  if (!['approve', 'reject', 'flag'].includes(decision)) return res.status(400).json({ error: 'Decision must be approve, reject or flag' });
  const verification = {
    amountPaise: req.body?.verifiedAmount == null ? null : Math.round(Number(req.body.verifiedAmount) * 100),
    utr: req.body?.verifiedUtr == null ? null : String(req.body.verifiedUtr).trim(),
    externalReference: req.body?.externalReference == null ? null : String(req.body.externalReference).trim()
  };
  try {
    const recharge = decision === 'flag'
      ? await flagRecharge(id, user.id, req.body?.reason, verification)
      : await reviewRecharge(id, user.id, decision, req.body?.reason, verification);
    return res.status(200).json({ recharge });
  } catch (error) {
    if (isDuplicateUtrError(error)) {
      return res.status(409).json({ code: 'DUPLICATE_UTR', error: 'This UTR has already been submitted' });
    }
    const status = Number(error?.statusCode);
    return res.status(status >= 400 && status < 500 ? status : 400).json({ code: error?.code || undefined, error: error.message });
  }
}
