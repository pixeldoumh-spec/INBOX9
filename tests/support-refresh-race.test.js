import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';

test('support refresh preserves newer local ticket state', async () => {
  const source = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(source, /function mergeSupportTickets\(incoming\)/);
  assert.match(source, /incomingAt >= currentAt/);
  assert.match(source, /state\.supportTickets = mergeSupportTickets\(payload\.tickets\)/);
});
