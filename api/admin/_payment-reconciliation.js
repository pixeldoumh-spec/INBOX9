import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, getMockSession, requireUser } from '../_lib/auth.js';
import { getPaymentReconciliationSummary, listFlaggedRecharges, listPendingRecharges, listPaymentReconciliationEvents } from '../_lib/wallet-repository.js';
import { getPaymentSettings } from '../_lib/payment-settings.js';
import { listPaymentWebhookEvents } from '../_lib/payment-webhook.js';

export default async function handler(req, res) {
  applySecurityHeaders(res); requestId(req, res);
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  if (!dbEnabled()) return res.status(503).json({ error: 'Payment reconciliation requires PostgreSQL' });
  if (!await rateLimitAsync(req, res, 'admin-payment-reconciliation', 30, 60_000) || !enforceSameOrigin(req, res)) return;
  try {
    const [summary, flagged, manualEvents, webhookEvents, paymentSettings, sessionSignalsRaw] = await Promise.all([
      getPaymentReconciliationSummary({ from: req.query?.from, to: req.query?.to }),
      listFlaggedRecharges(Number(req.query?.limit || 100)),
      listPaymentReconciliationEvents(Number(req.query?.eventLimit || 100)),
      listPaymentWebhookEvents(Number(req.query?.webhookLimit || 100)),
      getPaymentSettings(),
      listPendingRecharges(25)
    ]);
    const sessionSignals = sessionSignalsRaw.map(item => ({
      id: item.id,
      email: item.email,
      amountPaise: item.amountPaise,
      utr: item.utr,
      status: item.status,
      submittedAt: item.submittedAt,
      submissionSessionId: item.submissionSessionId,
      submissionSession: item.submissionSession,
      sessionContext: item.sessionContext
    }));
    return res.status(200).json({ summary, flagged, manualEvents, webhookEvents, paymentSettings, sessionSignals, generatedAt: Date.now() });
  } catch (error) { return res.status(503).json({ error: 'Payment reconciliation unavailable' }); }
}
