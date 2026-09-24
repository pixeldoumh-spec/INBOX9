# INBOX9 Sprint 2 — Authentication & Authorization

## Status
Implementation complete. Production PostgreSQL authentication requires a configured DATABASE_URL; live DB integration was not available in the build environment.

## Delivered

- User registration
- Password hashing using Node.js `scryptSync`
- Login sessions using cryptographically random opaque tokens
- SHA-256 token hashes stored server-side
- HttpOnly SameSite=Lax session cookies
- Secure cookie behavior in production
- Session expiry (7 days)
- Logout and server-side session revocation
- `/api/auth/me`
- Mock-mode authentication for local development
- Activation ownership via `activations.user_id`
- User-scoped activation listing
- User-scoped activation lookup
- User-scoped cancellation
- Protected activation APIs
- Role field (`user` / `admin`) in the user model
- Per-user demo state keying in the frontend
- Authenticated dashboard entry flow

## Database migration

`db/migrations/002_auth.sql`

Creates:

- `users`
- `sessions`
- `activations.user_id`
- session/ownership indexes

## Migration runner

`npm run db:migrate` now discovers and applies ordered SQL migrations.

## Security notes

- Passwords are never stored in plaintext.
- Session tokens are never stored plaintext in PostgreSQL.
- Browser JavaScript cannot read the session cookie.
- Activation APIs require an authenticated user.
- Persistent activations are queried by `user_id`, preventing one user from retrieving another user's activation by ID.
- Production authentication requires PostgreSQL; mock authentication is for local/demo use only.

## Verification

`npm run check` — PASS

`npm test` — 2/2 PASS

Local HTTP authentication lifecycle — PASS:

1. unauthenticated `/api/auth/me` → 401
2. register → 201
3. authenticated `/api/auth/me` → 200
4. authenticated activation listing → 200
5. authenticated activation reservation → 201
6. logout → 200

## Not yet production-complete

- Email verification
- Password reset/recovery
- MFA/passkeys
- login/registration rate limiting
- account lockout/abuse controls
- admin-only APIs
- production PostgreSQL integration test
- wallet authorization and server-side ledger (Sprint 3)

These remain intentionally outside Sprint 2's minimum acceptance scope.
