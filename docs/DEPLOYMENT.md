# Deployment Plan — Vercel

## Current mode

The repository is Vercel-ready for the **mock/demo** environment:
- static frontend in `public/`
- Node API Functions in `api/`
- local development server in `dev-server.js`
- `vercel.json` with baseline security headers

Vercel supports Node.js server-side code and recommends keeping secrets in Environment Variables rather than source control. New Vercel deployments should use a currently supported Node version; this project targets Node 22+. Vercel has announced Node 20 deprecation for new deployments beginning October 1, 2026. 

## Local verification

```bash
npm run check
npm test
npm start
```

Then verify:

```bash
curl http://localhost:4173/api/health
curl http://localhost:4173/api/services
curl -X POST http://localhost:4173/api/activations \
  -H 'content-type: application/json' \
  -d '{"serviceId":"whatsapp-0"}'
```

## Vercel deployment

The project can be imported from GitHub and deployed from the repository root. Add server-only environment variables in Vercel Project Settings → Environment Variables; do not commit `.env` files or provider secrets.

Required for production infrastructure:

```text
DATABASE_URL=
DATABASE_SSL=true
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
APP_ORIGIN=https://<your-domain>
CRON_SECRET=<long-random-secret>
INBOX9_UPI_ID=<your-UPI-ID>
```

Provider credentials are added only when an authorized provider adapter is enabled. `SESSION_SECRET` is reserved and is not currently part of request authentication.


## Reconciliation scheduling

The default `vercel.json` intentionally does not register an every-minute Cron Job. Vercel's current plan limits allow once-per-minute Cron Jobs on Pro and Enterprise, while Hobby is limited to once per day; an every-minute schedule would fail deployment on Hobby. citehttps://vercel.com/docs/cron-jobs/usage-and-pricing

The reconciliation API endpoint supports Vercel's `Authorization: Bearer <CRON_SECRET>` convention. citehttps://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs

For Hobby or plan-independent deployment, the repository includes `.github/workflows/reconcile.yml`, which invokes the endpoint every five minutes. Set these repository secrets:

```text
INBOX9_RECONCILE_URL=https://<your-domain>/api/internal-provider-reconcile
INBOX9_CRON_SECRET=<same value as Vercel CRON_SECRET>
```

For Pro/Enterprise, you may instead add the endpoint as a Vercel Cron schedule such as `* * * * *` after deployment. Vercel notes that cron delivery is best effort and does not retry failed invocations, so the reconciliation code is intentionally idempotent and retryable. citehttps://vercel.com/docs/cron-jobs/manage-cron-jobs#cron-job-delivery-and-idempotency

## Do not enable real transactions yet

The current activation state and demo wallet are intentionally not a production datastore. Vercel Functions may run in separate invocations/instances, so production activation state must move to a durable database before real traffic is enabled.

## Sprint 7 staging gate

Before a production Vercel deployment:

1. Create a managed PostgreSQL database and set `DATABASE_URL` and `DATABASE_SSL=true`.
2. Set `APP_ORIGIN` to the exact HTTPS deployment origin.
3. Provision Upstash Redis and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. Set `CRON_SECRET` to a long random secret; Vercel sends it as `Authorization: Bearer <CRON_SECRET>`.
5. Set `INBOX9_MAX_SESSIONS` (default 5; allowed 1–20).
6. Run `npm run db:migrate` against the staging database.
7. Run `npm run db:verify` and require `ok: true`.
8. Deploy the Vercel staging project.
9. Run `STAGING_URL=https://<staging-domain> npm run staging:smoke`.
10. Run `npm run issue9:e2e` locally for regression coverage.
11. Verify reconciliation scheduling: for Hobby use the included GitHub Actions workflow; for Pro/Enterprise a Vercel Cron can invoke the endpoint with `Authorization: Bearer <CRON_SECRET>`.
12. Check `/api/health` and require `ready: true`; production health requires the database, shared rate limiter, canonical origin, and `CRON_SECRET`.
13. Only then promote to production.

Production state-changing endpoints fail closed if the shared rate-limit service is missing. No production credential belongs in Git.
