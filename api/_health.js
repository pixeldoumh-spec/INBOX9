import { applySecurityHeaders, requestId } from './_lib/security.js';
import { getPool, dbEnabled } from './_lib/db.js';
import { isSyntheticProduction } from './_lib/runtime-config.js';

export default async function handler(_req, res) {
  applySecurityHeaders(res);
  requestId(_req, res);
  const production = process.env.NODE_ENV === 'production';
  const databaseConfigured = dbEnabled();
  let databaseReachable = false;
  if (databaseConfigured) {
    try {
      const pool = await getPool();
      await pool.query('SELECT 1');
      databaseReachable = true;
    } catch (error) {
      console.error('health.database_failed', error);
    }
  }
  const sharedRateLimitConfigured = databaseConfigured;
  const appOriginConfigured = Boolean(process.env.APP_ORIGIN);
  const cronSecretConfigured = Boolean(process.env.CRON_SECRET);
  const cronSecretManualFallbackConfigured = Boolean(process.env.INTERNAL_CRON_SECRET);
  const paymentWebhookConfigured = Boolean(String(process.env.INBOX9_PAYMENT_WEBHOOK_SECRET || '').trim());
  const ready = isSyntheticProduction()
    ? true
    : databaseConfigured && databaseReachable && (!production || (sharedRateLimitConfigured && appOriginConfigured && cronSecretConfigured));
  const body = { ok: true, ready, mode: isSyntheticProduction() ? 'synthetic' : (databaseConfigured ? 'postgres' : 'local'),
    dependencies: { database: { configured: databaseConfigured, reachable: databaseReachable },
      sharedRateLimit: { configured: sharedRateLimitConfigured, provider: 'postgres' }, appOrigin: { configured: appOriginConfigured },
      cronAuth: { configured: cronSecretConfigured, manualFallbackConfigured: cronSecretManualFallbackConfigured },
      syntheticRuntime: { enabled: isSyntheticProduction() },
      paymentWebhook: { configured: paymentWebhookConfigured } },
    timestamp: new Date().toISOString() };
  return res.status(ready || !production ? 200 : 503).json(body);
}
