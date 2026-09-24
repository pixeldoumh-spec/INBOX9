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

  assert.match(customerData, /async function loadCustomerData\(renderAfter = false, silent = false\)/);
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


mport test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('customer login bootstraps services, activations and wallet data', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  const submitStart = app.indexOf('async function submitAuth(event)');
  const submitEnd = app.indexOf('\n\nfunction openSecurity()', submitStart);
  assert.ok(submitStart >= 0);
  assert.ok(submitEnd > submitStart);
  const submitAuth = app.slice(submitStart, submitEnd);
  assert.match(submitAuth, /state\.user = payload\.user/);
  assert.match(submitAuth, /await loadCustomerData\(\)/);

  const customerStart = app.indexOf('async function loadCustomerData(');
  const customerEnd = app.indexOf('\n\nasync function refreshCatalog', customerStart);
  assert.ok(customerStart >= 0);
  assert.ok(customerEnd > customerStart);
  const loadCustomerData = app.slice(customerStart, customerEnd);
  assert.match(loadCustomerData, /api\('\/api\/services'\)/);
  assert.match(loadCustomerData, /api\('\/api\/activations'\)/);
  assert.match(loadCustomerData, /api\('\/api\/wallet'\)/);
  assert.match(loadCustomerData, /state\.services =/);
  assert.match(loadCustomerData, /prepareServiceCatalog\(\)/);

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
