# Deployment & Operations

INBOX9 is intentionally deployment-agnostic. The repository contains a plain Node-based HTTP runtime and API route modules, so the hosting layer can be selected later.

## Local development

Requirements: Node.js 22+.

```bash
npm run check
npm test
npm start
```

The local server listens on port 4173 by default.

Basic checks:

```bash
curl http://localhost:4173/api/health
curl http://localhost:4173/api/services
```

## Hosting requirements

Any hosting environment used later should provide:

- Node.js 22 or newer.
- A process/runtime that can execute `dev-server.js` or an equivalent Node entrypoint.
- Persistent PostgreSQL for production account, wallet, activation and inventory state.
- Shared Redis-compatible rate limiting when production rate limiting is enabled.
- HTTPS and a stable canonical application origin.
- Secure environment-variable storage for secrets.
- A scheduler, task runner, or external cron service for periodic reconciliation.

The exact reverse proxy, process manager, container, platform, domain and scheduler can be selected independently of the application code.

## Environment

Start from `.env.example`. Do not commit real credentials.

Required production infrastructure:

```text
DATABASE_URL=
DATABASE_SSL=true
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
APP_ORIGIN=https://your-domain.example
CRON_SECRET=<long-random-secret>
INBOX9_UPI_ID=<your-UPI-ID>
```

Provider credentials are added only when an authorized provider adapter is enabled.

## Reconciliation scheduling

The reconciliation endpoint is:

```text
/api/internal-provider-reconcile
```

It accepts the configured scheduled-job secret using:

```text
Authorization: Bearer <CRON_SECRET>
```

The repository also includes `.github/workflows/reconcile.yml` as one optional scheduler implementation. A different scheduler can call the same endpoint; the application does not depend on GitHub Actions.

## Production readiness

Before enabling real traffic:

1. Provision PostgreSQL and run `npm run db:migrate`.
2. Run `npm run db:verify` and require `ok: true`.
3. Configure the shared rate limiter.
4. Configure `APP_ORIGIN` for the final HTTPS origin.
5. Configure a strong `CRON_SECRET`.
6. Configure the real recharge destination.
7. Run `npm run check` and `npm test`.
8. Run `npm run issue9:e2e` and `npm run synthetic:smoke`.
9. Configure a scheduler to invoke reconciliation.
10. Verify `/api/health` reports the required production dependencies as ready.

Production state-changing endpoints fail closed when required shared services are missing. No production credential belongs in Git.
