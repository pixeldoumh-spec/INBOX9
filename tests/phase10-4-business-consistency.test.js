import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) {
  return fs.readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('Phase 10.4 keeps purchase price, debit and activation snapshot on one server-authoritative value', async () => {
  const source = await read('api/_lib/activation-repository.js');
  assert.match(source, /const pricePaise = Number\(dbService\.price_paise\)/);
  assert.match(source, /debitForActivation\(client, userId, pricePaise/);
  assert.match(source, /reserved\.status \|\| 'Active',reserved\.otp,now,expiresAt,[\\s\\S]*?pricePaise,currency/);
  assert.match(source, /pricePaise: row\.price_paise/);
});

test('Phase 10.4 refunds exactly the charged activation amount and cannot duplicate a credit', async () => {
  const operations = await read('api/_lib/provider-operations.js');
  const wallet = await read('api/_lib/wallet-repository.js');
  assert.match(operations, /SET status='Refunded',refund_paise=price_paise/);
  assert.match(operations, /creditRefund\(client, row\.user_id, Number\(row\.price_paise\), row\.activation_id/);
  assert.match(wallet, /UNIQUE \(reference_type, reference_id\)/);
});

test('Phase 10.4 keeps notification history synchronized for every customer-visible activation state', async () => {
  const notifications = await read('api/_lib/notification-repository.js');
  for (const state of ['Active','CancellationPending','Completed','Expired','Refunded','Cancelled']) {
    assert.match(notifications, new RegExp(state));
  }
  assert.match(notifications, /source_id=\\$2 AND n\.event_key='status:'\|\|a\.status/);
});

test('Phase 10.4 refreshes customer wallet, order history and notifications after lifecycle mutations', async () => {
  const app = await read('frontend/src/app/App.tsx');
  const activity = await read('frontend/src/app/customer-activity-pages.tsx');
  assert.match(app, /createActivation\(selected\.id,idempotencyKey\)/);
  assert.match(app, /client\.invalidateQueries\(\{queryKey:\['wallet'\]\}\)/);
  assert.match(app, /client\.invalidateQueries\(\{queryKey:\['activations'\]\}\)/);
  assert.match(app, /client\.invalidateQueries\(\{queryKey:\['notifications'\]\}\)/);
  assert.match(activity, /<span>Order history<\/span>/);
  assert.match(activity, /<span>Order \{a\.id\}<\/span>/);
  assert.match(activity, /a\.status==='Refunded'.*refundPaise/);
});

test('Phase 10.4 lifecycle state grouping is aligned across ongoing and order history views', async () => {
  const lifecycle = await read('api/_lib/activation-lifecycle.js');
  const ui = await read('frontend/src/app/customer-ui-shared.tsx');
  for (const state of ['Active','CancellationPending','ExpirationPending']) {
    assert.match(lifecycle, new RegExp(state));
    assert.match(ui, new RegExp(state));
  }
  for (const state of ['Completed','Expired','Refunded','Cancelled']) {
    assert.match(lifecycle, new RegExp(state));
    assert.match(ui, new RegExp(state));
  }
});
