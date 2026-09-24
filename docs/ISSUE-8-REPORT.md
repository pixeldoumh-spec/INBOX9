# Issue 8 — Session Lifecycle Hardening

## Status

**CLOSED / COMPLETE — v0.8.7**

Issue 8 hardens the INBOX9 email/password session lifecycle without introducing OTP authentication for INBOX9 accounts.

## Implemented

### 1. Durable session-version invalidation

`users.session_version` is now checked against `sessions.session_version` on every authenticated request.

A session-version increment invalidates all existing sessions even before/independent of cookie deletion.

### 2. Logout current session

The existing `POST /api/auth/logout` deletes only the current session and clears the HttpOnly cookie.

### 3. Logout all sessions

New endpoint:

`POST /api/auth/logout-all`

The endpoint locks the user row, increments `session_version`, deletes all session rows for that user, and clears the current cookie. This invalidates sessions on every device.

### 4. Password change with global invalidation

New endpoint:

`POST /api/auth/change-password`

Request body:

```json
{
  "currentPassword": "...",
  "newPassword": "..."
}
```

The server:

1. authenticates the current session;
2. locks the user row;
3. verifies the current password;
4. writes a new scrypt password hash;
5. increments `session_version`;
6. deletes all previous sessions;
7. issues exactly one fresh session to the device that changed the password.

### 5. Session count control

New sessions are capped at `INBOX9_MAX_SESSIONS` per user.

Default: **5**.

The allowed configuration range is **1–20**.

When the limit is exceeded, the oldest sessions are removed while the newly created session is retained.

### 6. Absolute expiry and stale-session cleanup

Sessions retain a **7-day absolute expiry**.

`cleanupExpiredSessions()` removes expired or revoked rows in bounded batches.

The scheduled internal reconciliation endpoint now performs session cleanup alongside activation and wallet reconciliation.

### 7. Last-used tracking

`sessions.last_used_at` records recent use. The timestamp is refreshed at most once every five minutes so authenticated reads do not create a database write on every request.

### 8. Safer password comparison

`verifyPassword()` now verifies buffer lengths before calling `timingSafeEqual`, preventing malformed stored digests from causing a comparison exception.

### 9. Login lifecycle correction

An unknown email now returns the product-defined account-not-found message:

`Account not found. Please sign up first.`

Existing accounts continue to use email + password; no INBOX9 OTP authentication was added.

### 10. UI

The authenticated application now exposes **Account security** from the user card with:

- Change password
- Sign out all sessions

## Database migration

Added:

`db/migrations/012_auth_session_hardening.sql`

New fields:

- `users.session_version`
- `users.password_changed_at`
- `sessions.session_version`
- `sessions.last_used_at`
- `sessions.revoked_at`

Indexes support session lookup and bounded cleanup.

## Security properties

- Passwords are never stored in plaintext.
- Session tokens remain opaque and cryptographically random.
- Only token hashes are persisted in PostgreSQL.
- Session tokens/hashes are never returned to the browser.
- Production cookies continue to use the `__Host-` prefix, `Secure`, `HttpOnly`, and `SameSite=Lax`.
- State-changing auth endpoints retain the existing same-origin protection and shared rate limiting.
- Password change and logout-all are transactional at the user/session lifecycle boundary.

## Verification

### Static checks

`npm run check` — **PASS**

### Automated tests

`npm test` — **32/32 PASS**

New Issue 8 tests cover password-change policy, malformed password digest handling, bounded session policy, and the migration contents.

### Local staging smoke

`npm run staging:smoke` with the local server running — **PASS**

Observed:

- health OK
- mock-local mode
- 76 India service records

## Production gate

A live PostgreSQL migration and browser-level multi-device session test still require the actual staging database/credentials. Those were not present in this environment, so they are intentionally not marked as passed.

## Release

`v0.8.7`
