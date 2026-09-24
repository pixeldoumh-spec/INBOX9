import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';

test('notification API keeps mock authentication aligned with other customer routes', async () => {
  const source = await fs.readFile(new URL('../api/notifications/_index.js', import.meta.url), 'utf8');
  assert.match(source, /getSessionUser, getMockSession, requireUser/);
  assert.match(source, /dbEnabled\(\) \? await getSessionUser\(req\) : getMockSession\(req\)/);
  assert.match(source, /persistent:false/);
});
