import test from 'node:test';
import assert from 'node:assert/strict';
import { SYNTHETIC_CAPACITY, SYNTHETIC_SERVER_COUNT, getServerForSlot, getSyntheticServer, listSyntheticServers } from '../api/_lib/synthetic-servers.js';

test('100 synthetic slots per service are partitioned into contiguous server chunks', () => {
  const servers = listSyntheticServers();
  assert.equal(servers.length, SYNTHETIC_SERVER_COUNT);
  assert.equal(servers.reduce((sum, s) => sum + s.capacity, 0), SYNTHETIC_CAPACITY);
  assert.equal(servers[0].startSlot, 1);
  assert.equal(servers.at(-1).endSlot, SYNTHETIC_CAPACITY);
  for (let i = 1; i < servers.length; i += 1) {
    assert.equal(servers[i].startSlot, servers[i - 1].endSlot + 1);
  }
});

test('server capacities distribute 5,000 slots as evenly as possible', () => {
  const servers = listSyntheticServers();
  assert.equal(servers.reduce((sum, s) => sum + s.capacity, 0), 100);
  assert.equal(Math.max(...servers.map((s) => s.capacity)), 10);
  assert.equal(Math.min(...servers.map((s) => s.capacity)), 9);
  assert.equal(Math.max(...servers.map((s) => s.capacity)) - Math.min(...servers.map((s) => s.capacity)), 1);
});

test('every synthetic slot maps to exactly one server', () => {
  const servers = listSyntheticServers();
  for (const slot of [1, 9, 10, 90, 100]) {
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
