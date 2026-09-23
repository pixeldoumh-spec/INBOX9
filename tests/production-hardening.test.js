import test from 'node:test';
import assert from 'node:assert/strict';

test('reconciliation endpoint accepts Vercel Cron GET or authenticated POST', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../api/_internal-provider-reconcile.js', import.meta.url), 'utf8');
  assert.match(src, /process\.env\.CRON_SECRET/);
  assert.doesNotMatch(src, /INTERNAL_CRON_SECRET/);
  assert.match(src, /x-vercel-cron-schedule/);
  assert.match(src, /req\.method !== 'POST' && !isVercelCron/);
  assert.match(src, /Bearer /);
  assert.match(src, /timingSafeEqual/);
});

test('activation polling route has per-user/per-activation rate limiting', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../api/activations/_id.js', import.meta.url), 'utf8');
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
  const src = await fs.readFile(new URL('../api/_health.js', import.meta.url), 'utf8');
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


test('production runtime is pinned to a supported Node 22 major', async () => {
  const fs = await import('node:fs/promises');
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.engines?.node, '22.x');
});
