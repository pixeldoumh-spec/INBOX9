# INBOX9 Sprint 7 — Production Infrastructure & Integration Testing

## Completed

- Added database readiness to `/api/health`.
- Added shared serverless rate-limit support through Upstash Redis REST.
- Production state-changing endpoints now fail closed if the shared rate-limit service is not configured.
- Added migration `006_production_integrity.sql` with operational indexes and the activation-owner integrity requirement.
- Added `scripts/verify-db.mjs` for staging/production schema verification.
- Added `scripts/staging-smoke.mjs` for deployment smoke tests.
- Added staging environment template `.env.staging.example`.
- Added production readiness documentation and explicit infrastructure gates.
- Existing application tests continue to run without requiring a live database.

## Production prerequisites

The following must be provisioned outside the source repository:

1. Managed PostgreSQL database.
2. Upstash Redis (or another shared Redis-compatible rate-limit service).
3. Vercel project/environment variables.
4. Authorized upstream provider credentials, when real provider integration is enabled.
5. Production domain for `APP_ORIGIN`.

## Database verification

```bash
npm run db:migrate
npm run db:verify
```

`db:verify` fails if required tables are missing or activations have no owner.

## Staging smoke test

```bash
STAGING_URL=https://staging.example.com npm run staging:smoke
```

The smoke test verifies health/readiness and the exact 76-service India/INR catalog.

## Shared rate limiter

Production rate limiting uses Upstash Redis REST. Local development falls back to the in-process limiter so the application remains easy to run locally.

Production intentionally fails closed if the shared rate-limit service is missing or unavailable.

## Live integration status

A live PostgreSQL test cannot be marked passed until a managed PostgreSQL instance is provisioned and its connection string is supplied to the deployment environment. The same applies to the shared Redis service.

No production credential is stored in this repository.
