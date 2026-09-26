export const REQUIRED_PRODUCTION_ENV = [
  'DATABASE_URL',
  'APP_ORIGIN',
  'CRON_SECRET',
];

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

export function runtimeMode() {
  const raw = String(process.env.INBOX9_RUNTIME_MODE || '').trim().toLowerCase();
  if (raw === 'postgres') return 'postgres';
  if (raw === 'synthetic' && !isProduction()) return 'synthetic';
  return isProduction() ? 'unconfigured' : 'local';
}

// Fulfillment mode is separate from storage/runtime mode: production can use
// PostgreSQL persistence while serving only the deterministic synthetic engine
// until an external provider partnership is approved.
export function fulfillmentMode() {
  const raw = String(process.env.INBOX9_FULFILLMENT_MODE || '').trim().toLowerCase();
  return raw === 'external' ? 'external' : 'synthetic';
}

export function isSyntheticProduction() {
  return isProduction() && runtimeMode() === 'synthetic';
}

export function isPersistentProduction() {
  return isProduction() && runtimeMode() === 'postgres';
}

export function productionConfiguration() {
  return {
    database: Boolean(process.env.DATABASE_URL),
    sharedRateLimit: Boolean(process.env.DATABASE_URL),
    appOrigin: Boolean(process.env.APP_ORIGIN),
    cronAuth: Boolean(process.env.CRON_SECRET),
    syntheticRuntime: isSyntheticProduction(),
    persistentRuntime: isPersistentProduction(),
    fulfillmentMode: fulfillmentMode(),
    rechargeEnabled: String(process.env.INBOX9_ENABLE_RECHARGE || '').trim().toLowerCase() === 'true',
    upiDestination: Boolean(String(process.env.INBOX9_UPI_ID || '').trim()),
    paymentWebhook: Boolean(String(process.env.INBOX9_PAYMENT_WEBHOOK_SECRET || '').trim()),
  };
}

export function assertProductionConfiguration() {
  if (!isProduction()) return;

  const mode = runtimeMode();
  const config = productionConfiguration();
  const missing = [];

  if (mode !== 'postgres') missing.push('INBOX9_RUNTIME_MODE=postgres');
  if (!config.database) missing.push('DATABASE_URL');
  if (!config.appOrigin) missing.push('APP_ORIGIN');
  if (!config.cronAuth) missing.push('CRON_SECRET');

  if (missing.length) throw new Error('Production configuration incomplete: ' + missing.join(', '));
}
