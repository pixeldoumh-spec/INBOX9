import test from 'node:test';
import assert from 'node:assert/strict';
import { SYNTHETIC_CAPACITY, SYNTHETIC_SERVER_COUNT, getServerForSlot, getSyntheticServer, issueSyntheticServer, listSyntheticServers } from '../api/_lib/synthetic-servers.js';

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

test('server capacities distribute 100 slots as evenly as possible', () => {
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

test('synthetic server issuance always returns a valid internal server', () => {
  const servers = listSyntheticServers();
  for (let i = 0; i < 50; i += 1) {
    const issued = issueSyntheticServer();
    assert.ok(issued);
    assert.ok(servers.some((server) => server.id === issued.id));
    assert.ok(issued.capacity > 0);
  }
});

test('synthetic QA may pin a known server and rejects unknown servers', () => {
  assert.equal(issueSyntheticServer({ requestedServerId: 'SERVER-3' }).id, 'server-3');
  assert.throws(
    () => issueSyntheticServer({ requestedServerId: 'server-12' }),
    error => error?.code === 'UNKNOWN_SYNTHETIC_SERVER'
  );
});
