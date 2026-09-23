export const REQUIRED_PRODUCTION_ENV = [
  'DATABASE_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'APP_ORIGIN',
  'CRON_SECRET',
];

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

export function isSyntheticProduction() {
  return isProduction() && String(process.env.INBOX9_RUNTIME_MODE || 'synthetic').trim().toLowerCase() === 'synthetic';
}

export function productionConfiguration() {
  return {
    database: Boolean(process.env.DATABASE_URL),
    sharedRateLimit: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    appOrigin: Boolean(process.env.APP_ORIGIN),
    cronAuth: Boolean(process.env.CRON_SECRET),
    syntheticRuntime: String(process.env.INBOX9_RUNTIME_MODE || 'synthetic').trim().toLowerCase() === 'synthetic',
  };
}

export function assertProductionConfiguration() {
  if (!isProduction() || isSyntheticProduction()) return;
  const config = productionConfiguration();
  const missing = [];
  if (!config.database) missing.push('DATABASE_URL');
  if (!config.sharedRateLimit) missing.push('UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN');
  if (!config.appOrigin) missing.push('APP_ORIGIN');
  if (!config.cronAuth) missing.push('CRON_SECRET');
  if (!config.syntheticRuntime) missing.push('INBOX9_RUNTIME_MODE=synthetic');
  if (missing.length) throw new Error('Production configuration incomplete: ' + missing.join(', '));
}
