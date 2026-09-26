# Phase 7 — Production Provider Activation Readiness

Phase 7 adds a single server-side release gate before an external provider can enter customer fulfillment.

## Readiness gates

An external provider must have all of the following:

- Server-side credentials configured.
- A successful provider health check.
- A verified live India service catalog.
- At least one active route, with every active route backed by a verified provider-service mapping.
- Deterministic cancellation support.
- External routing explicitly enabled.
- No open route circuit or unresolved consecutive route failures.
- No pending or stale provider operations and no failed/running reconciliation run.
- A successful lifecycle canary.

The gate is persisted in provider_production_readiness and exposed only through the admin API.

## Synthetic safety lane

The synthetic provider is permanently enabled as the internal production safety lane.

Its non-billable readiness canary exercises:

reserve -> getActivation -> cancel -> Refunded

This does not call a telecom network, an external provider, or mutate a customer wallet.

## External provider canaries

The readiness endpoint does not automatically reserve a real external number. A reserve call can create a billable provider-side order and may leave an orphaned allocation if the response is uncertain.

Therefore external lifecycle canaries remain not_run until an explicitly approved controlled provider test has been completed and recorded by a future provider activation workflow.

## Admin controls

GET /api/admin/provider-readiness evaluates and persists the current readiness snapshot.

POST /api/admin/provider-readiness supports:

- refresh
- activate with providerId
- deactivate with providerId

Activation is rejected unless the complete readiness gate is ready. The synthetic provider cannot be disabled through this gate.

## Current production boundary

INBOX9 remains synthetic-only in production until external credentials, live mappings, route configuration, and approved lifecycle evidence exist. Public/shared SMS inbox sources are not fulfillment providers.