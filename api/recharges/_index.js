import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { isSyntheticProduction } from '../_lib/runtime-config.js';
import { getSessionUser, getMockSession, requireUser } from '../_lib/auth.js';
import { createRecharge, listRecharges, MIN_RECHARGE_PAISE, MAX_RECHARGE_PAISE, getUpiId, isDuplicateUtrError } from '../_lib/wallet-repository.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }
  if (process.env.NODE_ENV === 'production' && !dbEnabled() && !isSyntheticProduction()) return res.status(503).json({ error: 'Recharge database is not configured' });
  const rechargeEnabled = String(process.env.INBOX9_ENABLE_RECHARGE || '').trim().toLowerCase() === 'true' && Boolean(getUpiId()) && dbEnabled();
  if (req.method === 'GET') {
    if (!dbEnabled()) return res.status(200).json({ recharges: [], persistent: false, rechargeEnabled: false, minPaise: MIN_RECHARGE_PAISE, maxPaise: MAX_RECHARGE_PAISE, upiId: null });
    try { return res.status(200).json({ recharges: await listRecharges(user.id), persistent: true, rechargeEnabled, minPaise: MIN_RECHARGE_PAISE, maxPaise: MAX_RECHARGE_PAISE, upiId: getUpiId() }); }
    catch (error) { return res.status(503).json({ error: 'Recharge service unavailable' }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rechargeEnabled) return res.status(503).json({ error: 'Wallet recharge is not enabled on this deployment' });
  if (!await rateLimitAsync(req, res, 'recharge-create', 10, 600_000) || !enforceSameOrigin(req, res)) return;
  try { validateBodySize(req); } catch (e) { return res.status(413).json({ error: e.message }); }
  const amountPaise = Math.round(Number(req.body?.amount || 0) * 100);
  const utr = String(req.body?.utr || '').trim();
  try {
    return res.status(201).json(await createRecharge(user.id, amountPaise, utr));
  } catch (error) {
    if (error.code === 'DUPLICATE_UTR' || isDuplicateUtrError(error)) {
      return res.status(409).json({ code: 'DUPLICATE_UTR', error: 'This UTR has already been submitted' });
    }
    if (error.code === 'UPI_DESTINATION_NOT_CONFIGURED') return res.status(503).json({ error: error.message, code: error.code });
    return res.status(400).json({ error: error.message });
  }
}
