# Phase 8.3 — Exact 90-Service Provider Mapping

Phase 8.3 establishes the certification workflow that maps the active INBOX9 service catalog to external provider service codes.

## Mapping contract

1. The provider live India catalog must already be verified by Phase 8.2.
2. The provider catalog must contain an explicit service code/id; a display name cannot be used as a provider code.
3. The normalized provider service name must produce exactly one candidate for the INBOX9 service.
4. Ambiguous, missing, stale, or inactive mappings are not treated as verified.
5. The final mapping set must exactly match the active INBOX9 service catalog.

The active catalog is currently 90 services.

## Admin workflow

`GET /api/admin/provider-qualification` returns provider and per-service mapping status.

`POST /api/admin/provider-qualification` with `action=verify-exact-candidates` can batch-certify a provider after its live India catalog is available. The operation is transactional and records an audit event containing the verified mapping set.

The existing `action=verify-mapping` path remains available for individually verified provider codes.

## Safety

Batch verification does not activate a provider route. Provider activation remains governed by the Phase 7 production-readiness gate.

No number reservation is performed by the mapping workflow.

Public/shared SMS sources remain outside customer fulfillment.