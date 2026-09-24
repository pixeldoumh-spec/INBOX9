import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('customer login bootstraps services, activations and wallet data', async () => {
  const [app, customerData] = await Promise.all([
    fs.readFile(new URL('../app.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../customer/customer-data.js', import.meta.url), 'utf8'),
  ]);

  const submitStart = app.indexOf('async function submitAuth(event)');
  const submitEnd = app.indexOf('\n\nfunction openSecurity()', submitStart);
  assert.ok(submitStart >= 0);
  assert.ok(submitEnd > submitStart);
  const submitAuth = app.slice(submitStart, submitEnd);
  assert.match(submitAuth, /state\.user = payload\.user/);
  assert.match(submitAuth, /await loadCustomerData\(\)/);

  assert.match(customerData, /async function loadCustomerData\(\{ renderAfter = false, silent = false \} = \{\}\)/);
  assert.match(customerData, /api\('\/api\/services'\)/);
  assert.match(customerData, /api\('\/api\/activations'\)/);
  assert.match(customerData, /api\('\/api\/wallet'\)/);
  assert.match(customerData, /state\.services =/);
  assert.match(customerData, /prepareServiceCatalog\(\)/);

  const bootstrapStart = app.indexOf('async function bootstrapSession()');
  assert.ok(bootstrapStart >= 0);
  const bootstrapEnd = app.indexOf('\n\nasync function retryBootstrap', bootstrapStart);
  assert.ok(bootstrapEnd > bootstrapStart);
  const bootstrapSession = app.slice(bootstrapStart, bootstrapEnd);
  assert.match(bootstrapSession, /api\('\/api\/auth\/me'\)/);
  assert.match(bootstrapSession, /await loadCustomerData\(\)/);

  const bootStart = app.indexOf('async function boot()');
  assert.ok(bootStart >= 0);
  assert.match(app.slice(bootStart, bootStart + 700), /await bootstrapSession\(\)/);
  assert.match(app, /boot\(\);\s*$/);
});


test('customer API client explicitly includes same-origin session credentials', async () => {
  const apiClient = await fs.readFile(new URL('../customer/api-client.js', import.meta.url), 'utf8');
  assert.match(apiClient, /credentials: options\.credentials \?\? 'same-origin'/);
});


test('customer render keeps authentication form hidden while session bootstrap is pending', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /document\.getElementById\('app'\)\.innerHTML = state\.loading/);
  assert.match(app, /state\.loading \? sessionBootstrapPage\(\)/);
  assert.match(app, /state\.bootstrapError \? bootstrapErrorPage\(\) : authPage\(\)/);
});
