import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';

test('activation and recharge lifecycle emit idempotent notification events', async () => {
  const [notifications, activations, operations, wallet] = await Promise.all([
    fs.readFile(new URL('../api/_lib/notification-repository.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../api/_lib/activation-repository.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../api/_lib/provider-operations.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../api/_lib/wallet-repository.js', import.meta.url), 'utf8'),
  ]);
  assert.ok(notifications.includes('ON CONFLICT (user_id,source_type,source_id,event_key) DO NOTHING'));
  for (const key of ['status:Pending','status:Approved','status:Rejected','status:Flagged']) assert.ok(wallet.includes(key), key);
  assert.ok(activations.includes("eventKey:'status:'+activation.status"));
  assert.ok(activations.includes("title: providerState.status === 'Completed'"));
  for (const key of ['status:CancellationPending','status:Refunded','cancel:failed','status:Completed','status:Expired']) assert.ok(operations.includes(key), key);
});
