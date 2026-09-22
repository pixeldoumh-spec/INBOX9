import { reconcilePendingCancellations, reconcileExpiringActivations } from './_lib/provider-operations.js';
import { cleanupExpiredActivationIdempotency } from './_lib/idempotency.js';
import { reconcileWallets } from './_lib/wallet-reconciliation.js';
import { cleanupExpiredSessions } from './_lib/auth.js';
import crypto from 'node:crypto';
import { applySecurityHeaders, requestId } from './_lib/security.js';

export default async function handler(req, res) {
  applySecurityHeaders(res); requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const expected = process.env.CRON_SECRET;
  const bearer = String(req.headers.authorization || '');
  const supplied = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : String(req.headers['x-inbox9-cron-secret'] || '');
  const valid = Boolean(expected && supplied && supplied.length === String(expected).length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(String(expected))));
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const cancellationResults = await reconcilePendingCancellations({ limit: 25 });
    const expirationResults = await reconcileExpiringActivations({ limit: 25 });
    const cleanedIdempotency = await cleanupExpiredActivationIdempotency(500);
    const walletReconciliation = await reconcileWallets({ limit: 10000 });
    const cleanedSessions = await cleanupExpiredSessions({ limit: 1000 });
    return res.status(200).json({
      ok: true,
      processed: cancellationResults.length + expirationResults.length,
      cancellationProcessed: cancellationResults.length,
      expirationProcessed: expirationResults.length,
      cleanedIdempotency,
      cleanedSessions,
      walletReconciliation,
      cancellationResults,
      expirationResults,
    });
  } catch (error) {
    console.error('internal.reconcile_failed', error);
    return res.status(503).json({ error: 'Provider reconciliation unavailable' });
  }
}
