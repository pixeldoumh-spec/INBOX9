import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';

test('account security control opens the security modal', async () => {
  const source = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(source, /function openSecurity\(\)\{/);
  assert.match(source, /state\.securityOpen = true/);
  assert.match(source, /scheduleDialogFocus\(\)/);
});
