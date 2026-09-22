import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const adminReadRoutes = [
  'api/admin/activations.js',
  'api/admin/audit.js',
  'api/admin/ledger.js',
  'api/admin/overview.js',
  'api/admin/providers-health.js',
  'api/admin/providers.js',
  'api/admin/recharges/index.js',
  'api/admin/services.js',
  'api/admin/users.js',
];

test('TASK-006 admin read routes apply common headers and rate limiting', async () => {
  const sources = await Promise.all(adminReadRoutes.map(path => fs.readFile(new URL('../' + path, import.meta.url), 'utf8')));
  for (const src of sources) {
    assert.match(src, /applySecurityHeaders/);
    assert.match(src, /requestId/);
    assert.match(src, /rateLimitAsync/);
    assert.match(src, /req\.method !== 'GET'/);
  }
});

test('TASK-006 wallet reconciliation write route has CSRF, rate and payload guards', async () => {
  const src = await fs.readFile(new URL('../api/admin/wallet-reconciliation.js', import.meta.url), 'utf8');
  assert.match(src, /applySecurityHeaders/);
  assert.match(src, /rateLimitAsync/);
  assert.match(src, /enforceSameOrigin/);
  assert.match(src, /validateBodySize/);
  assert.match(src, /req\.method === 'POST'/);
});

test('TASK-006 database TLS verification is not disabled by default', async () => {
  const src = await fs.readFile(new URL('../api/_lib/db.js', import.meta.url), 'utf8');
  assert.match(src, /DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false'/);
  assert.match(src, /DATABASE_SSL_CA/);
});

test('TASK-006 login failure message does not enumerate missing accounts', async () => {
  const src = await fs.readFile(new URL('../api/_lib/auth.js', import.meta.url), 'utf8');
  assert.match(src, /Invalid email or password/);
  assert.doesNotMatch(src, /Account not found\. Please sign up first\./);
});