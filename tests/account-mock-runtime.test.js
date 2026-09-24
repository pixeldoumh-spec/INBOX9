import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';

test('synthetic account routes stay authenticated and usable for browser QA', async () => {
  const sessions = await fs.readFile(new URL('../api/auth/_sessions.js', import.meta.url), 'utf8');
  const profile = await fs.readFile(new URL('../api/auth/_profile.js', import.meta.url), 'utf8');
  const recovery = await fs.readFile(new URL('../api/auth/_recovery-code.js', import.meta.url), 'utf8');
  const auth = await fs.readFile(new URL('../api/_lib/auth.js', import.meta.url), 'utf8');
  assert.match(sessions, /dbEnabled\(\) \? await getSessionUser\(req\) : getMockSession\(req\)/);
  assert.match(profile, /getMockSession/);
  assert.match(recovery, /getMockSession/);
  assert.match(auth, /mockProfiles/);
  assert.match(auth, /mockRecoveryCodes/);
});
