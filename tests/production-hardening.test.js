import test from 'node:test';
import assert from 'node:assert/strict';

test('Vercel cron endpoint accepts Authorization Bearer CRON_SECRET and legacy header fallback', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../api/internal-provider-reconcile.js', import.meta.url), 'utf8');
  assert.match(src, /process\.env\.CRON_SECRET \|\| process\.env\.INTERNAL_CRON_SECRET/);
  assert.match(src, /Bearer /);
  assert.match(src, /x-inbox9-cron-secret/);
  assert.match(src, /timingSafeEqual/);
});

test('activation polling route has per-user/per-activation rate limiting', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../api/activations/[id].js', import.meta.url), 'utf8');
  assert.match(src, /rateLimitAsync/);
  assert.match(src, /activation-status/);
  assert.match(src, /user\.id/);
});

test('durable order history is hydrated from server activations', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(src, /syncFromServerActivations/);
  assert.match(src, /activationPayload\.activations/);
  assert.match(src, /isLiveActivation/);
});

test('production health requires cron auth and canonical origin', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../api/health.js', import.meta.url), 'utf8');
  assert.match(src, /appOriginConfigured/);
  assert.match(src, /cronSecretConfigured/);
  assert.match(src, /sharedRateLimitConfigured && appOriginConfigured && cronSecretConfigured/);
});

test('recharge audit is available inside the financial transaction', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../api/_lib/wallet-repository.js', import.meta.url), 'utf8');
  assert.match(src, /recordAuditTx/);
  assert.match(src, /recharge\.approve/);
  assert.match(src, /recharge\.reject/);
  assert.match(src, /recharge\.flag/);
});
