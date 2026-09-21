import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, getMockSession, requireUser } from '../_lib/auth.js';
import { getWallet, listLedger, listRecharges } from '../_lib/wallet-repository.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }
  if (!dbEnabled() && process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'Wallet database is not configured' });
  if (!dbEnabled()) return res.status(200).json({ balancePaise: 0, currency: 'INR', ledger: [], recharges: [], persistent: false });
  try {
    const wallet = await getWallet(user.id);
    const [ledger, recharges] = await Promise.all([listLedger(user.id), listRecharges(user.id)]);
    return res.status(200).json({ ...wallet, ledger, recharges, persistent: true });
  } catch (error) {
    console.error('wallet.read_failed', error);
    return res.status(503).json({ error: 'Wallet service unavailable' });
  }
}
