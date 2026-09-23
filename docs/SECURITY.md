# Security Gate

Before real users, payments, or real upstream number-provider traffic are enabled:

- authenticate every user session server-side;
- authorize activation reads/writes to the owning user;
- move wallet operations to a server-side double-entry ledger;
- use payment-provider webhooks as the source of truth for credits;
- add idempotency keys to reserve/cancel/top-up operations;
- rate-limit login, reserve, poll, cancel and API-key endpoints;
- never expose upstream provider secrets to browser code;
- validate all request bodies and bound payload size;
- record immutable audit events for financial and provider actions;
- add abuse monitoring and account-level quotas;
- add dependency and secret scanning in CI;
- use HTTPS-only production deployment and secure cookies for authenticated sessions.

The mock implementation does not perform real third-party account verification or provider acquisition.


## Session lifecycle hardening
- Production sessions use 32-byte cryptographically random opaque tokens stored only as SHA-256 hashes.
- Sessions have a 7-day absolute lifetime and are capped at `INBOX9_MAX_SESSIONS` (default 5) per user.
- Each authenticated request validates expiry, account activity and a per-user `session_version`; the last-used timestamp is refreshed at most every five minutes.
- Logout removes the current session. Logout-all increments the user session version and removes every session.
- Changing a password increments the session version, removes every prior session, and creates one fresh session for the current device.
- The scheduled reconciliation job removes expired/revoked session rows so stale session data does not accumulate.
- Session tokens, hashes and password material are never returned to the browser or admin API.

## TASK-006 hardening
- Admin read endpoints now emit the common security headers and are rate limited.
- The wallet reconciliation POST path enforces same-origin requests, payload limits and rate limiting.
- PostgreSQL TLS certificate verification is enabled by default when SSL is enabled; provide `DATABASE_SSL_CA` for a private CA rather than disabling verification.
- Login failures use a generic invalid-credentials response to reduce account-enumeration leakage.
- The reconciliation handler supports a Vercel Cron GET path authenticated with `CRON_SECRET` and validated with Vercel's cron schedule header; the existing authenticated POST form remains available for an external scheduler.