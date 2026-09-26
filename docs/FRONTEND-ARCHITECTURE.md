# INBOX9 Frontend Architecture — v1

Status: Phase 4 wallet, notifications, support, account + resilience completed; Phase 2 Apps launcher re-certified.

## Source basis

The supplied reference analysis describes a mobile-first app shell/dashboard with a searchable icon-grid catalog, persistent navigation, REST-backed application data, and an app-like launcher interaction.

For INBOX9, the customer interaction is intentionally split into independent screens:

Apps launcher
  -> Service detail
  -> Activation
  -> OTP/status

## Phase boundaries

1. Frontend lives under /frontend.
2. Frontend communicates with the backend only through same-origin /api/* HTTP APIs.
3. Frontend does not import backend implementation modules.
4. Service catalog comes from GET /api/services.
5. Server state is owned by TanStack Query; session state remains in a small Zustand store.
6. Activation updates use a replaceable polling transport abstraction.
7. Apps Home and Service Detail are separate routes.
8. Visual design does not dictate backend architecture.

## Phase 2 launcher contract

- fixed/sticky INBOX9 header
- notification indicator with unread count
- Add Funds / wallet access
- four-column, scrollable service launcher on mobile
- live client-side search across service name/category
- 90 services rendered directly from GET /api/services
- stable service-ID-based logo rendering through the committed optimized HD artwork bundle
- deterministic fallback for services without supplied artwork
- fixed bottom navigation: Apps, Buy, Active, Account
- service tiles route to the independent service-detail screen

## Phase 3 service + activation contract

The service and activation path is now implemented end-to-end at the customer-app layer:

1. Service detail loads the authoritative service catalog entry.
2. The current PostgreSQL wallet balance is displayed before purchase.
3. Purchase is blocked in the UI when wallet balance is insufficient or wallet verification fails.
4. A unique idempotency key is sent with every activation request.
5. Successful activation refreshes wallet and Active queries before navigation.
6. Active shows persisted customer-owned activations, sorted newest first.
7. Activation detail polls the backend while the activation is Active.
8. Number and OTP can be copied from the activation screen.
9. Countdown reflects the server-provided expiry timestamp.
10. Cancellation calls the backend cancellation endpoint and refreshes wallet + Active state.
11. Error handling distinguishes insufficient balance, stock/service availability, and real-provider-readiness failures.
12. Terminal states are rendered separately: Completed, Expired, Refunded, Cancelled.
13. Provider and internal IDs remain behind the API boundary.

## Phase 4 customer-account contract

The account layer is now connected to the existing backend contracts:

- Wallet balance remains PostgreSQL-authoritative.
- UPI recharge submission accepts INR 100–5,000 plus a customer UTR and keeps the request pending until server-side payment verification.
- Recharge history and wallet ledger are visible with credit/debit filtering.
- Notifications remain persistent, support mark-all-read, and deep-link to related account/activation surfaces.
- Support provides ticket creation, activation/recharge references, threaded message history, and customer replies.
- Account provides display-name updates, password change, one-time recovery-code generation, password recovery, session listing/revocation, sign-out, and sign-out-everywhere.
- Offline/reconnect state is surfaced in the app shell and server-backed queries are refreshed after reconnection.

## Production boundary

The customer UI is ready for a real provider route, but the repository currently fails closed for production purchases when the approved real-provider credentials, mappings, authorization, and canary controls are not configured. No synthetic number/OTP lifecycle is presented as production telecom inventory.

## Routes

/login
/register
/apps
/apps/service/:serviceId
/buy
/active
/active/:activationId
/wallet
/notifications
/support
/account

## Current catalog

The backend exposes the 90-service India/INR catalog from the Diwa Play cutoff. Service IDs are stable slugs, so logo assets and UI state are not coupled to catalog order.

## Build sequence

Phase 0 — Architecture freeze: completed.
Phase 1 — Frontend foundation: completed.
Phase 2 — Apps launcher: completed and Radium Night contrast/polish certified (2026-09-26).
Phase 3 — Service and activation: completed.
Phase 4 — Wallet, notifications, support, account: completed.
Phase 5 — Production certification: next.
