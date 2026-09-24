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


test('customer render restores the authenticated shell while session bootstrap is pending', async () => {
  const [app, state] = await Promise.all([
    fs.readFile(new URL('../app.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../customer/state.js', import.meta.url), 'utf8')
  ]);
  assert.match(state, /sessionHint: null/);
  assert.match(app, /SESSION_HINT_KEY = 'inbox9\.session-hint\.v1'/);
  assert.match(app, /state\.sessionHint = readSessionHint\(\)/);
  assert.match(app, /if \(state\.sessionHint\?\.user\) state\.user = state\.sessionHint\.user/);
  assert.match(app, /state\.user = payload\.user;\s*state\.sessionHint = \{ user: payload\.user \};\s*writeSessionHint\(payload\.user\)/);
});
