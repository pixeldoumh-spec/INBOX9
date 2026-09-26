import { applySecurityHeaders, requestId, rateLimitAsync } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { isSyntheticProduction } from '../_lib/runtime-config.js';
import { getSessionUser, getMockSession, requireUser } from '../_lib/auth.js';
import { getWallet, getWalletSummary, listLedger, listRecharges } from '../_lib/wallet-repository.js';
import { getPaymentSettings } from '../_lib/payment-settings.js';
import { getMockWallet } from '../_lib/mock.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }
  if (!await rateLimitAsync(req, res, 'wallet-read', 120, 60_000, user.id)) return;
  if (!dbEnabled() && process.env.NODE_ENV === 'production' && !isSyntheticProduction()) return res.status(503).json({ error: 'Wallet database is not configured' });
  if (!dbEnabled()) return res.status(200).json({ ...getMockWallet(user), persistent: false, paymentSettings: await getPaymentSettings() });
  try {
    const wallet = await getWallet(user.id);
    const [summary, ledger, recharges, paymentSettings] = await Promise.all([getWalletSummary(user.id), listLedger(user.id), listRecharges(user.id), getPaymentSettings()]);
    const legacyEnvEnabled = String(process.env.INBOX9_ENABLE_RECHARGE || '').trim().toLowerCase() === 'true';
    const rechargeEnabled = Boolean(paymentSettings.upiId) && (paymentSettings.enabled == null ? legacyEnvEnabled : paymentSettings.enabled);
    return res.status(200).json({ ...wallet, summary, ledger, recharges, persistent: true, rechargeEnabled, upiId: paymentSettings.upiId, paymentSettings });
  } catch (error) {
    console.error('wallet.read_failed', error);
    return res.status(503).json({ error: 'Wallet service unavailable' });
  }
}
