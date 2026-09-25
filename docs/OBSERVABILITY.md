# INBOX9 Production Observability

## What is monitored

INBOX9 now emits structured JSON application telemetry for every HTTP response. Each event includes a bounded request path, HTTP method, status code, duration, and the existing X-Request-Id. Request bodies, cookies, authorization headers, OTPs, UTRs, wallet amounts and database credentials are not logged by the observability layer.

Server errors are captured by the runtime error handler and process-level handlers. Browser window.error and unhandledrejection events are reported to the same-origin /api/client-errors endpoint, which is rate-limited and protected by production same-origin checks.

Render remains the infrastructure source for deployment logs and resource metrics. The scheduled GitHub Actions canary runs every 15 minutes and checks the public production runtime, PostgreSQL readiness, catalog cardinality (90 active services), request IDs, unauthenticated boundary behavior, and a small concurrent health burst. A failed canary is visible as a failed GitHub Actions run and can trigger the repository owner's configured GitHub notifications.

## Optional Sentry error monitoring

The server-side error pipeline supports Sentry without adding a runtime SDK dependency. Configure the service environment with:

- SENTRY_DSN — project DSN from the Sentry project settings.
- SENTRY_ENVIRONMENT=production
- SENTRY_RELEASE=<git commit or release identifier>

The DSN is used only server-side. Browser errors are submitted to INBOX9 and forwarded server-side, so the public browser bundle does not need the Sentry DSN.

The integration sends errors through Sentry's envelope endpoint using DSN authentication. It is fail-safe: a Sentry outage never fails an application request.

Do not place payment credentials, provider secrets, database URLs, session tokens, or full request bodies in Sentry tags or context.

## Operational checks

Use the Render dashboard/MCP to inspect:

- deploy state and latest commit
- application error logs
- HTTP request counts and p95 latency
- CPU and memory
- database connection health

The live canary is intentionally read-only with respect to customer state. It does not register users, move wallet money, create activations, or mutate production records.

## Current limitations

The current Render web service is on the Free plan, so this repository-level observability design should not be treated as a substitute for a paid external alerting/retention product. Sentry remains optional until a project DSN is configured.

Browser error monitoring covers uncaught runtime errors. It does not yet capture every performance trace or user interaction span.

## Incident triage

1. Open the failed INBOX9 production observability workflow run.
2. Check the Render deploy currently serving main.
3. Filter Render logs by level=error and request ID.
4. Check /api/health and /api/services.
5. Run the authenticated production smoke only when an operator is authorized to use production test identities.
