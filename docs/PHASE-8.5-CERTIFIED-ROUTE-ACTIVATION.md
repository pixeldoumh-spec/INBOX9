# Phase 8.5 — Certified External Route Activation

Phase 8.5 adds the final routing-control boundary between provider qualification/lifecycle certification and live external fulfillment.

## Activation contract

An external provider/service route may be activated only when:

1. External routing is enabled by server configuration.
2. The provider has server-side credentials.
3. The provider's live India catalog is verified.
4. The selected service has an active, verified provider-service mapping.
5. The provider supports deterministic cancellation, unless the explicit non-cancellable reserve override is enabled.
6. The selected service has a successful lifecycle certification.
7. That certification is for the same service and exact provider-service code.
8. The certification is recent enough for the configured freshness window.
9. Lifecycle cleanup and internal reconciliation were clean.
10. The current provider health check passes.

Activation of the first external route and the provider itself occurs in one database transaction, removing the previous circular dependency where provider activation required an already-active route.

## Runtime protection

The fulfillment route selector independently checks for a recent successful lifecycle certification that matches the active provider-service mapping. A route therefore stops being eligible automatically when its certification becomes stale or its mapping changes.

## Safety defaults

Production defaults remain:

`INBOX9_ENABLE_EXTERNAL_ROUTING=false`

`INBOX9_RUN_BILLABLE_PROVIDER_CANARY=false`

`INBOX9_PROVIDER_CERT_MAX_AGE_MS=86400000`

No external provider route was activated as part of Phase 8.5 because the production external-routing flag remains disabled and the currently configured production lane is synthetic-only.

## Audit and operations

Route activation/deactivation is transactionally audited as `provider.route.production_activated` or `provider.route.production_deactivated`. Synthetic routing remains immutable through the external route-control path.

Public/shared SMS sources remain excluded from customer fulfillment.
