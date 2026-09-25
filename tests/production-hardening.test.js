import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createServer } from '../server.js';

async function request(server, pathname, { headers = {} } = {}) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(pathname, `http://127.0.0.1:${address.port}`), { headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('standalone server serves the clean root with baseline security headers and CSP', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await request(server, '/');
    assert.equal(response.status, 200);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-frame-options'], 'DENY');
    assert.equal(response.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.equal(response.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()');
    assert.match(response.headers['content-security-policy'], /default-src 'self'/);
    assert.match(response.headers['content-security-policy'], /script-src 'self'/);
    assert.match(response.headers['strict-transport-security'], /max-age=31536000/);
    assert.match(response.headers['cache-control'], /private, no-cache/);
    assert.ok(response.headers.etag, 'HTML root should expose a validator');
    assert.ok(response.headers['last-modified'], 'HTML root should expose Last-Modified');
    assert.match(response.body, /INBOX9/);
    assert.match(response.headers['content-type'], /text\/html/i);

    const validated = await request(server, '/', { headers: { 'If-None-Match': response.headers.etag } });
    assert.equal(validated.status, 304, 'unchanged root should revalidate to 304');
  } finally {
    server.close();
    await once(server, 'close');
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('reconciliation endpoint requires an authenticated POST from an external scheduler', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../api/_internal-provider-reconcile.js', import.meta.url), 'utf8');
  assert.match(src, /process\.env\.CRON_SECRET/);
  assert.match(src, /req\.method !== 'POST'/);
  assert.match(src, /Bearer /);
  assert.match(src, /timingSafeEqual/);
  assert.match(src, /verifyGithubOidcToken/);
});

test('activation polling route has per-user/per-activation rate limiting', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../api/activations/_id.js', import.meta.url), 'utf8');
  assert.match(src, /rateLimitAsync/);
  assert.match(src, /activation-status/);
  assert.match(src, /user\.id/);
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
