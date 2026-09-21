import { dbEnabled } from '../../_lib/db.js';
import { getSessionUser, requireAdmin } from '../../_lib/auth.js';
import { getLatestWalletReconciliation, listOpenWalletReconciliationIssues, reconcileWallets } from '../../_lib/wallet-reconciliation.js';

export default async function handler(req, res) {
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!dbEnabled()) return res.status(503).json({ error: 'Wallet reconciliation requires PostgreSQL' });
  const user = await getSessionUser(req);
  try { requireAdmin(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }
  try {
    if (req.method === 'POST') return res.status(200).json(await reconcileWallets({ limit: req.body?.limit }));
    return res.status(200).json({ latest: await getLatestWalletReconciliation(), openIssues: await listOpenWalletReconciliationIssues(req.query?.limit) });
  } catch (error) {
    console.error('admin.wallet_reconciliation_failed', error);
    return res.status(503).json({ error: 'Wallet reconciliation unavailable' });
  }
}
