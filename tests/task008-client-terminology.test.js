import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const forbiddenClientTerm = /(^|[^A-Za-z])(synthetic|indian|india|indan)(?=$|[^A-Za-z])/im;

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

test('client marketplace has a defined eleven-server fallback', async () => {
  const app = await readClient('app.js');
  assert.match(app, /const MARKET_CAPACITY = 5000;/);
  assert.match(app, /const MARKET_SERVER_COUNT = 11;/);
  assert.match(app, /const MARKET_SERVERS = \(\(\) => \{/);
  assert.match(app, /Math\.floor\(MARKET_CAPACITY \/ MARKET_SERVER_COUNT\)/);
  assert.match(app, /index < remainder/);
  assert.doesNotMatch(app, /\bSYNTHETIC_SERVERS\b/);
});

test('client remains explicit about the +91 display format without naming a country', async () => {
  const app = await readClient('app.js');
  assert.match(app, /Number format: \+91/);
  assert.match(app, /MARKETPLACE \/ \+91/);
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
