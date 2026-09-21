import { applySecurityHeaders, requestId } from './_lib/security.js';
import { getPool, dbEnabled } from './_lib/db.js';

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
  const sharedRateLimitConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const appOriginConfigured = Boolean(process.env.APP_ORIGIN);
  const cronSecretConfigured = Boolean(process.env.CRON_SECRET);
  const cronSecretManualFallbackConfigured = Boolean(process.env.INTERNAL_CRON_SECRET);
  const ready = databaseConfigured && databaseReachable && (!production || (sharedRateLimitConfigured && appOriginConfigured && cronSecretConfigured));
  const body = {
    ok: true,
    ready,
    mode: databaseConfigured ? 'postgres' : 'mock',
    dependencies: {
      database: { configured: databaseConfigured, reachable: databaseReachable },
      sharedRateLimit: { configured: sharedRateLimitConfigured },
      appOrigin: { configured: appOriginConfigured },
      cronAuth: { configured: cronSecretConfigured, manualFallbackConfigured: cronSecretManualFallbackConfigured },
    },
    timestamp: new Date().toISOString(),
  };
  return res.status(ready || !production ? 200 : 503).json(body);
}
