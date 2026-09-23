import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('release ships one canonical browser bundle', async () => {
  const [html, app, boot] = await Promise.all([
    fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../app.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../boot.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /<script src="\/boot\.js" defer data-app-script="\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<script src="\/app\.js" defer><\/script>/);
  assert.match(boot, /dataset\.appScript/);
  assert.match(boot, /Date\.now\(\)/);
  assert.match(boot, /application bundle could not be loaded/);
  assert.match(app, /boot\(\);/);
  assert.doesNotMatch(app, /seedOrders/);
  assert.doesNotMatch(app, /localStorage/);
  assert.doesNotMatch(app, /hasPersistedBalance/);
});

test('production source has no hardcoded payment destination or QR asset', async () => {
  const [walletRepo, exampleEnv, stagingEnv, server] = await Promise.all([
    fs.readFile(new URL('../api/_lib/wallet-repository.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../.env.example', import.meta.url), 'utf8'),
    fs.readFile(new URL('../.env.staging.example', import.meta.url), 'utf8'),
    fs.readFile(new URL('../server.js', import.meta.url), 'utf8'),
  ]);
  assert.match(walletRepo, /String\(process\.env\.INBOX9_UPI_ID \|\| ''\)/);
  assert.doesNotMatch(walletRepo, /8106204597@ptyes/);
  assert.match(exampleEnv, /^INBOX9_UPI_ID=$/m);
  assert.match(stagingEnv, /^INBOX9_UPI_ID=$/m);
  assert.doesNotMatch(server, /upi-qr\.jpg|payment-qr\.jpg/);
});

test('production runtime mode is explicit', async () => {
  const runtime = await fs.readFile(new URL('../api/_lib/runtime-config.js', import.meta.url), 'utf8');
  assert.match(runtime, /return isProduction\(\) \? 'unconfigured' : 'local';/);
  assert.match(runtime, /if \(mode !== 'postgres'\) missing\.push\('INBOX9_RUNTIME_MODE=postgres'\);/);
});
