import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { isSyntheticProduction } from '../_lib/runtime-config.js';
import { getSessionUser, getSessionIdForRequest, getMockSession, requireUser } from '../_lib/auth.js';
import { createMockRecharge, listMockRecharges } from '../_lib/mock.js';
import { createRecharge, listRecharges, MIN_RECHARGE_PAISE, MAX_RECHARGE_PAISE, getUpiId, isDuplicateUtrError } from '../_lib/wallet-repository.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }
  if (process.env.NODE_ENV === 'production' && !dbEnabled() && !isSyntheticProduction()) return res.status(503).json({ error: 'Recharge database is not configured' });
  const production = process.env.NODE_ENV === 'production';
  const rechargeEnabled = production
    ? String(process.env.INBOX9_ENABLE_RECHARGE || '').trim().toLowerCase() === 'true' && Boolean(getUpiId()) && dbEnabled()
    : true;
  if (req.method === 'GET') {
    if (!dbEnabled()) return res.status(200).json({ recharges: listMockRecharges(user), persistent: false, rechargeEnabled, minPaise: MIN_RECHARGE_PAISE, maxPaise: MAX_RECHARGE_PAISE, upiId: getUpiId() });
    try { return res.status(200).json({ recharges: await listRecharges(user.id), persistent: true, rechargeEnabled, minPaise: MIN_RECHARGE_PAISE, maxPaise: MAX_RECHARGE_PAISE, upiId: getUpiId() }); }
    catch (error) { return res.status(503).json({ error: 'Recharge service unavailable' }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'recharge-create', 10, 600_000) || !enforceSameOrigin(req, res)) return;
  try { validateBodySize(req); } catch (e) { return res.status(413).json({ error: e.message }); }
  const amountPaise = Math.round(Number(req.body?.amount || 0) * 100);
  const utr = String(req.body?.utr || '').trim();
  if (!rechargeEnabled) return res.status(503).json({ error: 'Wallet recharge is not enabled on this deployment' });
  if (!dbEnabled()) {
    if (!Number.isInteger(amountPaise) || amountPaise < MIN_RECHARGE_PAISE || amountPaise > MAX_RECHARGE_PAISE) return res.status(400).json({ error: 'Recharge amount must be between ₹100 and ₹5,000' });
    if (!/^[A-Za-z0-9._-]{4,64}$/.test(utr)) return res.status(400).json({ error: 'Enter a valid UTR / transaction reference' });
    try { return res.status(201).json({ ...createMockRecharge(user, amountPaise, utr, getUpiId() || 'test@upi'), mode: 'mock' }); }
    catch (error) {
      if (error.code === 'DUPLICATE_UTR') return res.status(409).json({ code: 'DUPLICATE_UTR', error: 'This UTR has already been submitted' });
      console.error('recharge.mock_create_failed', error);
      return res.status(503).json({ error: 'Recharge service unavailable' });
    }
  }
  try {
    const submissionSessionId = dbEnabled() ? await getSessionIdForRequest(req) : null;
    return res.status(201).json(await createRecharge(user.id, amountPaise, utr, submissionSessionId));
  } catch (error) {
    if (error.code === 'DUPLICATE_UTR' || isDuplicateUtrError(error)) {
      return res.status(409).json({ code: 'DUPLICATE_UTR', error: 'This UTR has already been submitted' });
    }
    if (error.code === 'UPI_DESTINATION_NOT_CONFIGURED') return res.status(503).json({ error: error.message, code: error.code });
    const message = String(error.message || '');
    if (/^(Recharge amount must be between|Enter a valid UTR)/.test(message)) return res.status(400).json({ error: message });
    console.error('recharge.create_failed', error);
    return res.status(503).json({ error: 'Recharge service unavailable' });
  }
}
