import test from 'node:test';
import assert from 'node:assert/strict';
import { SYNTHETIC_CAPACITY, SYNTHETIC_SERVER_COUNT, getServerForSlot, getSyntheticServer, listSyntheticServers } from '../api/_lib/synthetic-servers.js';

test('synthetic capacity is partitioned into 11 contiguous server chunks', () => {
  const servers = listSyntheticServers();
  assert.equal(servers.length, SYNTHETIC_SERVER_COUNT);
  assert.equal(servers.reduce((sum, s) => sum + s.capacity, 0), SYNTHETIC_CAPACITY);
  assert.equal(servers[0].startSlot, 1);
  assert.equal(servers.at(-1).endSlot, SYNTHETIC_CAPACITY);
  for (let i = 1; i < servers.length; i += 1) {
    assert.equal(servers[i].startSlot, servers[i - 1].endSlot + 1);
  }
});

test('server capacities are 455 except the final 450-slot chunk', () => {
  const servers = listSyntheticServers();
  assert.deepEqual(servers.slice(0, 10).map((s) => s.capacity), Array(10).fill(455));
  assert.equal(servers[10].capacity, 450);
});

test('every synthetic slot maps to exactly one server', () => {
  const servers = listSyntheticServers();
  for (const slot of [1, 455, 456, 910, 4551, 5000]) {
    const server = getServerForSlot(slot);
    assert.ok(server);
    assert.ok(slot >= server.startSlot && slot <= server.endSlot);
    assert.equal(getSyntheticServer(server.id).id, server.id);
  }
});

test('unknown server ids are rejected', () => {
  assert.equal(getSyntheticServer('server-0'), null);
  assert.equal(getSyntheticServer('server-12'), null);
  assert.equal(getSyntheticServer('not-a-server'), null);
});
