import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';

test('support navigation does not rerender while its form is focused', async () => {
  const source = await fs.readFile(new URL('../customer/navigation.js', import.meta.url), 'utf8');
  assert.match(source, /activeElement\?\.closest\?\.\('#support-form'\)/);
});
