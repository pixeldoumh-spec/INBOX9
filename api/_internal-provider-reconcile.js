import { reconcilePendingCancellations, reconcileExpiringActivations } from './_lib/provider-operations.js';
import { cleanupExpiredActivationIdempotency } from './_lib/idempotency.js';
import { reconcileWallets } from './_lib/wallet-reconciliation.js';
import { cleanupExpiredSessions } from './_lib/auth.js';
import { beginProviderReconciliationRun, recordProviderReconciliationEvent, finishProviderReconciliationRun, findProviderReconciliationOrphans } from './_lib/provider-reconciliation-journal.js';
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
    try {
      await verifyGithubOidcToken(supplied);
      validGithubOidc = true;
    } catch {}
  }

  if (!validSharedSecret && !validGithubOidc) return res.status(401).json({ error: 'Unauthorized' });

  let runId = null;
  try {
    runId = await beginProviderReconciliationRun(validGithubOidc ? 'system' : 'cron', { source: 'internal-provider-reconcile' });
    const cancellationResults = await reconcilePendingCancellations({ limit: 25 });
    const expirationResults = await reconcileExpiringActivations({ limit: 25 });
    const results = [...cancellationResults, ...expirationResults];

    for (const result of results) {
      const success = ['Succeeded', 'Completed', 'Expired'].includes(String(result?.status));
      const retryable = Boolean(result?.retryable);
      await recordProviderReconciliationEvent(runId, {
        operationId: result?.operationId || null,
        activationId: result?.activationId || null,
        action: result?.status === 'Succeeded' ? 'cancel' : 'status_sync',
        outcome: success ? 'succeeded' : (retryable ? 'failed' : 'needs_review'),
        retryable,
        metadata: { status: result?.status || null, stale: Boolean(result?.stale) },
      });
    }

    const orphans = await findProviderReconciliationOrphans(100);
    for (const orphan of orphans) {
      await recordProviderReconciliationEvent(runId, {
        activationId: orphan.activation_id,
        providerId: orphan.provider_id,
        action: 'orphan_review',
        outcome: 'needs_review',
        retryable: false,
        providerActivationId: orphan.provider_activation_id,
        metadata: { activationStatus: orphan.status, adapterKey: orphan.adapter_key, service: orphan.service_name },
      });
    }

    const cleanedIdempotency = await cleanupExpiredActivationIdempotency(500);
    const walletReconciliation = await reconcileWallets({ limit: 10000 });
    const cleanedSessions = await cleanupExpiredSessions({ limit: 1000 });
    const failed = results.filter(result => !['Succeeded', 'Completed', 'Expired'].includes(String(result?.status))).length;
    const review = orphans.length;
    const status = failed || review ? 'Partial' : 'Succeeded';
    await finishProviderReconciliationRun(runId, status, {
      processed: results.length + review,
      succeeded: results.length - failed,
      failed,
      review,
    });

    return res.status(200).json({
      ok: true,
      runId,
      status,
      processed: results.length,
      cancellationProcessed: cancellationResults.length,
      expirationProcessed: expirationResults.length,
      orphanReviewCount: review,
      cleanedIdempotency,
      cleanedSessions,
      walletReconciliation,
      cancellationResults,
      expirationResults,
    });
  } catch (error) {
    if (runId) {
      try { await finishProviderReconciliationRun(runId, 'Failed', {}, error.message); } catch {}
    }
    console.error('internal.reconcile_failed', error);
    return res.status(503).json({ error: 'Provider reconciliation unavailable', runId });
  }
}
