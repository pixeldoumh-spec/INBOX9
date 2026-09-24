import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { listSyntheticServers, SYNTHETIC_SERVER_COUNT, SYNTHETIC_CAPACITY, getSyntheticServer } from '../api/_lib/synthetic-servers.js';
import { claimSyntheticSlot, shouldRestoreSyntheticStock, shouldRequireSyntheticReservation } from '../api/_lib/synthetic-inventory-repository.js';

test('synthetic servers partition 5,000 slots into exactly 11 contiguous chunks', () => {
  const servers = listSyntheticServers();
  assert.equal(servers.length, SYNTHETIC_SERVER_COUNT);
  assert.equal(servers.reduce((sum, server) => sum + server.capacity, 0), SYNTHETIC_CAPACITY);
  assert.equal(servers[0].capacity, 10);
  assert.equal(servers[5].capacity, 9);
  assert.equal(servers[6].capacity, 9);
  assert.equal(servers[10].capacity, 9);
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


test('synthetic terminal stock contract restores availability after Completed or Expired', () => {
  assert.equal(shouldRestoreSyntheticStock('Completed'), true);
  assert.equal(shouldRestoreSyntheticStock('Expired'), true);
  assert.equal(shouldRestoreSyntheticStock('Active'), false);
  assert.equal(shouldRestoreSyntheticStock('Refunded'), false);
  assert.equal(shouldRestoreSyntheticStock('Cancelled'), false);
});

test('synthetic slot claim surfaces durable uniqueness conflicts', async () => {
  const fakeClient = {
    query: async () => ({ rowCount: 0, rows: [] }),
  };
  await assert.rejects(
    () => claimSyntheticSlot(fakeClient, {
      activationId: 'ORD-CONFLICT',
      serviceId: 'whatsapp-0',
      slot: 1,
      serverId: 'server-1',
    }),
    error => error?.code === 'SYNTHETIC_SLOT_CONFLICT'
  );
});


test('synthetic terminal release requirement distinguishes modern and legacy activations', () => {
  assert.equal(shouldRequireSyntheticReservation({ engine: 'synthetic', slot: 1 }), true);
  assert.equal(shouldRequireSyntheticReservation({ engine: 'synthetic', slot: 100 }), true);
  assert.equal(shouldRequireSyntheticReservation({ engine: 'synthetic', slot: 101 }), false);
  assert.equal(shouldRequireSyntheticReservation({ engine: 'synthetic', slot: 0 }), false);
  assert.equal(shouldRequireSyntheticReservation({ engine: 'synthetic-local', slot: 1 }), false);
  assert.equal(shouldRequireSyntheticReservation({}), false);
});


test('PostgreSQL concurrent claims allow exactly one Reserved slot owner', { skip: !process.env.INBOX9_TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  const crypto = await import('node:crypto');
  const { getPool } = await import('../api/_lib/db.js');

  const pool = await getPool();
  const userA = `USR-SYN-${crypto.randomUUID()}`;
  const userB = `USR-SYN-${crypto.randomUUID()}`;
  const activationA = `ACT-SYN-${crypto.randomUUID()}`;
  const activationB = `ACT-SYN-${crypto.randomUUID()}`;
  const slot = 4999;
  const serviceId = 'whatsapp-0';
  const serverId = 'server-11';

  const fixture = await pool.connect();
  try {
    await fixture.query(
      `INSERT INTO users (id,email,password_hash,role)
       VALUES ($1,$2,'test-fixture-hash','user'),($3,$4,'test-fixture-hash','user')`,
      [userA, `${userA}@example.com`, userB, `${userB}@example.com`]
    );
    await fixture.query(
      `INSERT INTO activations
       (id,user_id,service_id,service_name,country,phone_number,price_paise,currency,status,expires_at,provider_metadata)
       VALUES
       ($1,$2,'whatsapp-0','WhatsApp','IN','+919000000001',950,'INR','Active',NOW() + INTERVAL '10 minutes',
        jsonb_build_object('engine','synthetic','slot',4999)),
       ($3,$4,'whatsapp-0','WhatsApp','IN','+919000000002',950,'INR','Active',NOW() + INTERVAL '10 minutes',
        jsonb_build_object('engine','synthetic','slot',4999))`,
      [activationA, userA, activationB, userB]
    );
  } finally {
    fixture.release();
  }

  const [clientA, clientB] = await Promise.all([pool.connect(), pool.connect()]);
  const attempt = async (client, activationId) => {
    await client.query('BEGIN');
    try {
      const row = await claimSyntheticSlot(client, {
        activationId,
        serviceId,
        slot,
        serverId,
      });
      return { outcome: 'won', row };
    } catch (error) {
      return { outcome: 'lost', error };
    }
  };

  try {
    const promiseA = attempt(clientA, activationA);
    const promiseB = attempt(clientB, activationB);

    const first = await Promise.race([promiseA, promiseB]);
    const firstClient = first.outcome === 'won' ? (first.row.activation_id === activationA ? clientA : clientB) : null;

    if (firstClient) await firstClient.query('COMMIT');

    const results = await Promise.all([promiseA, promiseB]);

    for (const client of [clientA, clientB]) {
      await client.query('ROLLBACK').catch(() => {});
    }

    assert.equal(results.filter(result => result.outcome === 'won').length, 1);
    assert.equal(results.filter(result => result.outcome === 'lost').length, 1);
    const loser = results.find(result => result.outcome === 'lost');
    assert.equal(loser.error?.code, 'SYNTHETIC_SLOT_CONFLICT');

    const check = await pool.query(
      `SELECT service_id,slot_index,COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE status='Reserved')::int AS reserved_count
         FROM synthetic_slot_reservations
        WHERE service_id=$1 AND slot_index=$2
        GROUP BY service_id,slot_index`,
      [serviceId, slot]
    );
    assert.equal(check.rows.length, 1);
    assert.equal(check.rows[0].count, 1);
    assert.equal(check.rows[0].reserved_count, 1);
  } finally {
    await clientA.release();
    await clientB.release();
    await pool.query('DELETE FROM synthetic_slot_reservations WHERE activation_id IN ($1,$2)', [activationA, activationB]);
    await pool.query('DELETE FROM activations WHERE id IN ($1,$2)', [activationA, activationB]);
    await pool.query('DELETE FROM users WHERE id IN ($1,$2)', [userA, userB]);
    await pool.end();
  }
});
