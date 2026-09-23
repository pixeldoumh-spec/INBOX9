import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('customer login bootstraps services, activations and wallet data', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  const submitStart = app.indexOf('async function submitAuth(event)');
  const submitEnd = app.indexOf('\n\nasync function loadCustomerData()', submitStart);
  assert.ok(submitStart >= 0);
  assert.ok(submitEnd > submitStart);
  const submitAuth = app.slice(submitStart, submitEnd);
  assert.match(submitAuth, /state\.user = payload\.user/);
  assert.match(submitAuth, /loadCustomerData\(\)/);

  const customerStart = app.indexOf('async function loadCustomerData()');
  const customerEnd = app.indexOf('\n\nasync function refreshCustomerData()', customerStart);
  assert.ok(customerStart >= 0);
  const loadCustomerData = app.slice(customerStart, customerEnd);
  assert.match(loadCustomerData, /api\('\/api\/services'\)/);
  assert.match(loadCustomerData, /api\('\/api\/activations'\)/);
  assert.match(loadCustomerData, /api\('\/api\/wallet'\)/);
  assert.match(loadCustomerData, /state\.services =/);
  assert.match(loadCustomerData, /prepareServiceCatalog\(\)/);

  const bootStart = app.indexOf('async function boot()');
  assert.ok(bootStart >= 0);
  assert.match(app.slice(bootStart, bootStart + 1800), /loadCustomerData\(\)/);
  assert.match(app, /boot\(\);\s*$/);
});
