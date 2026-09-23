import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin } from '../../_lib/security.js';
import { dbEnabled } from '../../_lib/db.js';
import { getSessionUser, getMockSession, requireUser } from '../../_lib/auth.js';
import { cancelActivation as cancelPersistedActivation } from '../../_lib/activation-repository.js';
import { cancelMock, creditMockWallet } from '../../_lib/mock.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }
  if (!await rateLimitAsync(req, res, 'activation-cancel', 20, 60_000) || !enforceSameOrigin(req, res)) return;
  let item;
  try {
    item = dbEnabled() ? await cancelPersistedActivation(req.query.id, user.id) : cancelMock(req.query.id);
  } catch (error) {
    if (error.code === 'PROVIDER_CANCEL_FAILED') return res.status(503).json({ error: error.message, code: error.code });
    console.error('activation.cancel_failed', error);
    return res.status(503).json({ error: 'Unable to cancel activation safely' });
  }
  if (!item) return res.status(404).json({ error: 'Activation not found' });
  if (item.activation) return res.status(200).json({ ...item.activation, refundPaise: item.activation.refundPaise ?? item.activation.pricePaise, walletBalancePaise: item.balancePaise });
  if (!dbEnabled() && item.refundPaise && !item.refundCredited) {
    item.refundCredited = true;
    const walletBalancePaise = creditMockWallet(user, Number(item.refundPaise), item.id, `Activation refund • ${item.service || ''}`);
    return res.status(200).json({ ...item, refundPaise: item.refundPaise, walletBalancePaise });
  }
  return res.status(200).json({ ...item, refundPaise: item.refundPaise ?? item.pricePaise });
}
