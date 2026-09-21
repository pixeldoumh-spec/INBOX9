import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordHash, verifyPassword, validatePasswordPair, sessionPolicy, authCookieName } from '../api/_lib/auth.js';

test('password verification handles normal and malformed digests safely', () => {
  const digest = passwordHash('Correct Horse Battery 42!');
  assert.equal(verifyPassword('Correct Horse Battery 42!', digest), true);
  assert.equal(verifyPassword('wrong-password', digest), false);
  assert.equal(verifyPassword('anything', 'scrypt$bad'), false);
});

test('password change policy rejects weak, reused and oversized passwords', () => {
  assert.equal(validatePasswordPair('CorrectPass123', 'short'), 'New password must be at least 8 characters');
  assert.equal(validatePasswordPair('CorrectPass123', 'CorrectPass123'), 'New password must be different from your current password');
  assert.equal(validatePasswordPair('CorrectPass123', 'x'.repeat(129)), 'New password is too long');
  assert.equal(validatePasswordPair('CorrectPass123', 'NewSecurePass456'), null);
});

test('session policy is bounded and cookie name is environment-aware', () => {
  assert.equal(sessionPolicy().absoluteDays, 7);
  assert.ok(sessionPolicy().maxSessionsPerUser >= 1);
  assert.ok(sessionPolicy().maxSessionsPerUser <= 20);
  assert.match(authCookieName(), /inbox9_session/);
});


test('session hardening migration contains versioning, revocation, activity and cleanup indexes', async () => {
  const fs = await import('node:fs/promises');
  const sql = await fs.readFile(new URL('../db/migrations/012_auth_session_hardening.sql', import.meta.url), 'utf8');
  assert.match(sql, /session_version BIGINT NOT NULL DEFAULT 1/);
  assert.match(sql, /last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW/);
  assert.match(sql, /revoked_at TIMESTAMPTZ/);
  assert.match(sql, /idx_sessions_cleanup/);
});
