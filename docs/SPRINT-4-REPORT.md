# INBOX9 Sprint 4 — Provider Integration Layer & Activation Routing

## Status
**Implementation complete; production provider connection intentionally not enabled.**

## Delivered
- Server-only provider adapter contract with normalized activation responses.
- Mock provider implementing reserve, status, cancel and health operations.
- PostgreSQL provider registry and service-to-provider routing tables.
- Migration `004_providers.sql` seeds the INBOX9 Mock Provider and routes all catalog services to it.
- Activations persist provider ID, provider activation ID and provider metadata.
- Activation creation reserves through the selected adapter, then atomically checks stock, debits the wallet and persists the activation.
- Failed DB creation attempts trigger provider cancellation compensation.
- Activation status requests synchronize state from the provider adapter.
- Active cancellation calls the provider adapter before issuing the wallet refund.
- Service stock is decremented on reservation and restored on expiry/cancellation.
- Admin-only provider inventory/health endpoint added.
- Frontend no longer invents local OTPs for persistent activations; it polls the activation API and displays server/provider state.
- Provider adapter unit tests included.

## Provider safety boundary
No real upstream provider credentials or automated third-party verification integration is included. Any production adapter must use an authorized provider API, stay server-side, and implement rate limits, audit logging, idempotency and provider-specific compliance controls.

## Acceptance
- Adapter contract: PASS
- Mock reserve/status/cancel lifecycle: PASS
- Provider routing schema: PASS
- Activation persistence integration: PASS
- Stock accounting: PASS
- Wallet debit/refund integration: PASS by code path and mock tests
- Frontend state synchronization: PASS by static/code review
- Live PostgreSQL integration: pending provisioned database
- Real provider integration: intentionally pending authorized provider

## API additions
- `GET /api/admin/providers` — admin only; provider registry + health snapshot.
- `GET /api/admin/providers-health` — admin only; provider health snapshot.

## Next sprint
Sprint 5 should focus on the Admin Console, provider/recharge operations, audit views and operational controls, followed by the security and E2E gates.
