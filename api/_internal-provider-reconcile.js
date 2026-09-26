import { reconcilePendingCancellations, reconcileExpiringActivations } from './_lib/provider-operations.js';
import { cleanupExpiredActivationIdempotency } from './_lib/idempotency.js';
import { reconcileWallets } from './_lib/wallet-reconciliation.js';
import { cleanupExpiredSessions } from './_lib/auth.js';
import { startProviderReconciliationRun, recordProviderReconciliationEvent, finishProviderReconciliationRun, getProviderReconciliationBacklog } from './_lib/provider-reconciliation-journal.js';
import crypto from 'node:crypto';
import { applySecurityHeaders, requestId } from './_lib/security.js';
import { verifyGithubOidcToken } from './_lib/github-oidc.js';

export default async function handler(req, res) {
  applySecurityHeaders(res); requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const expected = process.env.CRON_SECRET;
  const bearer = String(req.headers.authorization || '');
  const supplied = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : String(req.headers['x-inbox9-cron-secret'] || '');

  let validSharedSecret = false;
  if (expected && supplied && supplied.length === String(expected).length) {
    validSharedSecret = crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(String(expected)));
  }

  let validGithubOidc = false;
  if (!validSharedSecret && String(process.env.GITHUB_OIDC_RECONCILIATION || '').trim().toLowerCase() === 'true') {
    try { await verifyGithubOidcToken(supplied); validGithubOidc = true; } catch {}
  }
  if (!validSharedSecret && !validGithubOidc) return res.status(401).json({ error: 'Unauthorized' });

  let run;
  try {
    run = await startProviderReconciliationRun('cron');
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: 'Provider reconciliation already running' });
    console.error('internal.reconcile_start_failed', error);
    return res.status(503).json({ error: 'Provider reconciliation unavailable' });
  }

  try {
    const cancellationResults = await reconcilePendingCancellations({ limit: 25 });
    for (const item of cancellationResults) {
      await recordProviderReconciliationEvent(run.id, {
        operationId: item?.activationId || null,
        eventType: 'cancellation_reconciliation',
        outcome: item?.status || 'unknown',
        safeToRetry: item?.status !== 'Succeeded',
        details: item || {},
      }).catch(() => {});
    }

    const expirationResults = await reconcileExpiringActivations({ limit: 25 });
    for (const item of expirationResults) {
      await recordProviderReconciliationEvent(run.id, {
        operationId: item?.activationId || null,
        eventType: 'expiration_reconciliation',
        outcome: item?.status || 'unknown',
        safeToRetry: Boolean(item?.retryable),
        details: item || {},
      }).catch(() => {});
    }

    const cleanedIdempotency = await cleanupExpiredActivationIdempotency(500);
    const walletReconciliation = await reconcileWallets({ limit: 10000 });
    const cleanedSessions = await cleanupExpiredSessions({ limit: 1000 });
    const backlog = await getProviderReconciliationBacklog({ limit: 100 });

    await finishProviderReconciliationRun(run.id, {
      status: 'Succeeded',
      cancellationProcessed: cancellationResults.length,
      expirationProcessed: expirationResults.length,
      walletReconciliationProcessed: Number(walletReconciliation?.processed || walletReconciliation?.count || 0),
    });

    return res.status(200).json({
      ok: true,
      runId: run.id,
      processed: cancellationResults.length + expirationResults.length,
      cancellationProcessed: cancellationResults.length,
      expirationProcessed: expirationResults.length,
      cleanedIdempotency,
      cleanedSessions,
      walletReconciliation,
      unresolvedBacklog: backlog.length,
      cancellationResults,
      expirationResults,
      backlog,
    });
  } catch (error) {
    console.error('internal.reconcile_failed', error);
    await finishProviderReconciliationRun(run.id, {
      status: 'Failed',
      errorCode: error?.code || 'RECONCILIATION_FAILED',
      errorMessage: error?.message || 'Provider reconciliation failed',
    }).catch(() => {});
    return res.status(503).json({ error: 'Provider reconciliation unavailable', runId: run.id });
  }
}
