import { applySecurityHeaders, requestId, rateLimitAsync } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { isSyntheticProduction } from '../_lib/runtime-config.js';
import { isSyntheticProduction } from '../_lib/runtime-config.js';
import { getSessionUser, getMockSession, requireUser } from '../_lib/auth.js';
import { getWallet, listLedger, listRecharges } from '../_lib/wallet-repository.js';
import { getMockWallet } from '../_lib/mock.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }
  if (!await rateLimitAsync(req, res, 'wallet-read', 120, 60_000, user.id)) return;
  if (!dbEnabled() && process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'Wallet database is not configured' });
  if (!dbEnabled()) return res.status(200).json({ ...getMockWallet(user), persistent: false });
  try {
    const wallet = await getWallet(user.id);
    const [ledger, recharges] = await Promise.all([listLedger(user.id), listRecharges(user.id)]);
    return res.status(200).json({ ...wallet, ledger, recharges, persistent: true });
  } catch (error) {
    console.error('wallet.read_failed', error);
    return res.status(503).json({ error: 'Wallet service unavailable' });
  }
}
