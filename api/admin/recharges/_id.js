import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin } from '../../_lib/security.js';
import { dbEnabled } from '../../_lib/db.js';
import { getSessionUser, getMockSession, requireUser } from '../../_lib/auth.js';
import { reviewRecharge, flagRecharge, isDuplicateUtrError } from '../../_lib/wallet-repository.js';
import { reviewMockRecharge } from '../../_lib/mock.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  if (!await rateLimitAsync(req, res, 'admin-recharge', 60, 60_000) || !enforceSameOrigin(req, res)) return;
  if (!dbEnabled()) {
    const id = req.query?.id || String(req.url || '').split('/').pop();
    const decision = String(req.body?.decision || '').toLowerCase();
    try {
      const recharge = reviewMockRecharge(id, user, decision, req.body?.reason);
      return res.status(200).json({ recharge, mode: 'mock' });
    } catch (error) {
      if (error.code === 'DUPLICATE_UTR') return res.status(409).json({ code: error.code, error: 'This UTR has already been submitted' });
      if (Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
        return res.status(error.statusCode).json({ code: error.code, error: error.message });
      }
      console.error('admin.mock_recharge_review_failed', error);
      return res.status(503).json({ error: 'Recharge review unavailable' });
    }
  }
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
    if (status >= 400 && status < 500) {
      return res.status(status).json({ code: error?.code || undefined, error: error.message });
    }
    console.error('admin.recharge_review_failed', error);
    return res.status(503).json({ error: 'Recharge review unavailable' });
  }
}
