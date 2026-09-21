import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { listSyntheticServers, SYNTHETIC_SERVER_COUNT, SYNTHETIC_CAPACITY, getSyntheticServer } from '../api/_lib/synthetic-servers.js';
import { claimSyntheticSlot } from '../api/_lib/synthetic-inventory-repository.js';

test('synthetic servers partition 5,000 slots into exactly 11 contiguous chunks', () => {
  const servers = listSyntheticServers();
  assert.equal(servers.length, SYNTHETIC_SERVER_COUNT);
  assert.equal(servers.reduce((sum, server) => sum + server.capacity, 0), SYNTHETIC_CAPACITY);
  assert.equal(servers[0].capacity, 455);
  assert.equal(servers[5].capacity, 455);
  assert.equal(servers[6].capacity, 454);
  assert.equal(servers[10].capacity, 454);
  for (let i = 1; i < servers.length; i += 1) {
    assert.equal(servers[i].startSlot, servers[i - 1].endSlot + 1);
  }
  assert.equal(servers[10].endSlot, SYNTHETIC_CAPACITY);
});

test('synthetic slot claim validates server ownership before inserting', async () => {
  const calls = [];
  const fakeClient = { query: async (...args) => { calls.push(args); return { rowCount: 1, rows: [{ id: 'slot-1' }] }; } };
  const row = await claimSyntheticSlot(fakeClient, {
    activationId: 'ORD-1',
    serviceId: 'whatsapp-0',
    slot: 1,
    serverId: 'server-1',
  });
  assert.equal(row.id, 'slot-1');
  assert.match(calls[0][0], /uq_synthetic_reserved_slot|ON CONFLICT \(service_id, slot_index\)/);
});

test('synthetic slot claim rejects a slot outside the selected server', async () => {
  const fakeClient = { query: async () => { throw new Error('query should not execute'); } };
  await assert.rejects(
    () => claimSyntheticSlot(fakeClient, {
      activationId: 'ORD-2',
      serviceId: 'whatsapp-0',
      slot: getSyntheticServer('server-2').startSlot - 1,
      serverId: 'server-2',
    }),
    error => error?.code === 'SYNTHETIC_SLOT_SERVER_MISMATCH'
  );
});

test('synthetic inventory migration defines durable uniqueness and release state', async () => {
  const sql = await fs.readFile(new URL('../db/migrations/016_synthetic_inventory_correctness.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS synthetic_slot_reservations/);
  assert.match(sql, /uq_synthetic_reserved_slot/);
  assert.match(sql, /ON synthetic_slot_reservations\(service_id, slot_index\)/);
  assert.match(sql, /status='Reserved'/);
  assert.match(sql, /status IN \('Reserved','Released'\)/);
  assert.match(sql, /Backfill existing active synthetic activations/);
});
