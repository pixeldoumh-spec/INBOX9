# Phase 5 — Controlled Production Routing & Failover

Phase 5 adds the production routing controls needed before any authorized external provider can receive customer traffic.

## Routing order

Each service is evaluated by active route priority, then provider priority, then provider ID. A route is eligible only when:

- the service route is active;
- the provider is active;
- an external provider has a verified provider-service mapping;
- the provider adapter is installed;
- external routing is explicitly enabled; and
- the provider has a deterministic cancellation capability unless the non-cancellable override is explicitly enabled.

## Failover safety

INBOX9 never automatically fails over after an uncertain reserve outcome such as a network timeout. The upstream provider may already have allocated a number even though the response was lost.

Automatic failover is limited to definitive rejection conditions such as explicit no-inventory/service-unavailable responses and HTTP 429. Those attempts are recorded and can contribute to a per-provider/per-service circuit breaker.

After three safe-to-failover failures, a provider/service route is cooled down for two minutes. A successful allocation resets the circuit state.

## Auditability

Phase 5 stores two server-only records:

- `provider_route_health` — consecutive failures, circuit-open time, last error and last success.
- `provider_route_attempts` — reserve attempts, outcome, latency and whether failover was safe.

Both tables have RLS enabled and are accessed by the server runtime.

## Production flags

`INBOX9_ENABLE_EXTERNAL_ROUTING=false` keeps external routing disabled by default.

`INBOX9_ALLOW_NONCANCELLABLE_PROVIDER_RESERVE=false` prevents ASMS.ai/PVAPins-style non-cancellable reserve flows from receiving live traffic until Phase 6 reconciliation supplies deterministic orphan-allocation recovery.

Synthetic routing is not affected by either flag and remains the current live production fulfillment path.

## Current production state

Phase 5 is deployed with the routing controls installed, while the active production route remains synthetic. No public/shared inbox provider is used for fulfillment and no external provider is activated automatically.