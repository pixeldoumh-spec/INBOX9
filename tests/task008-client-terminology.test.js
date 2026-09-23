import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const forbiddenClientTerm = /(^|[^A-Za-z])(synthetic engine|synthetic server|slot ranges?|provider adapter|server partition)(?=$|[^A-Za-z])/im;

async function readClient(path) {
  return fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('client assets contain no internal location or engine terminology', async () => {
  for (const path of ['app.js', 'index.html', 'styles.css']) {
    const content = await readClient(path);
    assert.doesNotMatch(content, forbiddenClientTerm, path);
    assert.equal(content.includes('🇮🇳'), false, path);
  }
});

test('client page metadata uses neutral marketplace wording', async () => {
  const html = await readClient('index.html');
  assert.match(html, /INBOX9 — OTP Marketplace/);
  assert.doesNotMatch(html, /India|Indian|Synthetic/i);
});

test('customer client does not contain synthetic server inventory constants', async () => {
  const app = await readClient('app.js');
  assert.doesNotMatch(app, /const MARKET_SERVER_COUNT = 11/);
  assert.doesNotMatch(app, /const MARKET_CAPACITY = 5000/);
  assert.doesNotMatch(app, /data-buy-server-service/);
  assert.match(app, /data-buy-service/);
});

test('synthetic inventory capacity remains a backend concern', async () => {
  const servers = await fs.readFile(new URL('../api/_lib/synthetic-servers.js', import.meta.url), 'utf8');
  assert.match(servers, /5000/);
  assert.match(servers, /11/);
});
test('client explicitly presents the current India market while hiding allocation internals', async () => {
  const app = await readClient('app.js');
  assert.match(app, /MARKETPLACE \/ INDIA/);
  assert.match(app, /India \(\+91\)/);
  assert.doesNotMatch(app, /Tap a service to reveal servers/);
  assert.doesNotMatch(app, /SERVER SELECTION/);
});

test('browser-facing API errors use neutral marketplace language', async () => {
  const activationRoute = await fs.readFile(new URL('../api/activations/index.js', import.meta.url), 'utf8');
  const serverRoute = await fs.readFile(new URL('../api/services/[id]/servers.js', import.meta.url), 'utf8');
  const activationRepository = await fs.readFile(new URL('../api/_lib/activation-repository.js', import.meta.url), 'utf8');
  for (const content of [activationRoute, serverRoute, activationRepository]) {
    assert.doesNotMatch(content, /Only India \/ INR services are supported/);
    assert.doesNotMatch(content, /Unknown synthetic server/);
    assert.doesNotMatch(content, /Synthetic server inventory unavailable/);
    assert.doesNotMatch(content, /Synthetic inventory is temporarily unavailable/);
  }
  assert.match(activationRoute, /Unknown server/);
  assert.match(serverRoute, /Server inventory unavailable/);
  assert.match(activationRepository, /Number inventory is temporarily unavailable/);
});

test('admin provider presentation does not expose implementation adapter names', async () => {
  const app = await readClient('app.js');
  assert.match(app, /function providerUiName\(provider\)/);
  assert.match(app, /'Activation Service'/);
  assert.match(app, /'Managed service'/);
  assert.match(app, /provider\?\.id === 'provider-mock'/);
  assert.doesNotMatch(app, /\bSYNTHETIC_SERVERS\b/);
});
