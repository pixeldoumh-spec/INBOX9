import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const activationRepo = fs.readFileSync(new URL('../api/_lib/activation-repository.js', import.meta.url), 'utf8');

// Admin-controlled service data must be read from PostgreSQL at purchase time.
// The activation repository may accept a service descriptor for routing/provider
// selection, but the charge and persisted service fields must come from the locked DB row.
test('activation purchase uses the locked database service row for pricing and business fields', () => {
  assert.match(activationRepo, /SELECT id,name,category,currency,price_paise,country,availability,stock,active\s+FROM services WHERE id=\$1 FOR UPDATE/);
  assert.match(activationRepo, /const pricePaise = Number\(dbService\.price_paise\);/);
  assert.match(activationRepo, /await debitForActivation\(client, userId, pricePaise/);
  assert.doesNotMatch(activationRepo, /debitForActivation\(client, userId, service\.pricePaise/);
  assert.doesNotMatch(activationRepo, /service\.pricePaise,\s*id/);
});
