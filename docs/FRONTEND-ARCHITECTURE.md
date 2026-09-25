# INBOX9 Frontend Architecture — v1

Status: Phase 2 launcher completed; service/activation purchasing remains a separate phase.

## Source basis

The supplied reference analysis describes a mobile-first app shell/dashboard with a searchable icon-grid catalog, persistent navigation, REST-backed application data, and an app-like launcher interaction.

For INBOX9, the primary customer interaction is intentionally split into independent screens:

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
6. Activation live updates use a replaceable transport abstraction.
7. Apps Home and Service Detail are separate routes.
8. Visual design does not dictate backend architecture.

## Phase 2 launcher contract

The launcher is now a complete mobile-first catalog experience:
- fixed/sticky INBOX9 header
- notification indicator with unread count
- Add Funds action
- four-column, scrollable service launcher
- live client-side search across service name/category
- 216 services rendered directly from GET /api/services
- stable service-ID-based logo paths at /service-icons/{serviceId}.png
- graceful initials fallback when a logo is not installed
- fixed bottom navigation: Apps, Buy, Active, Account
- service tiles route to the independent service-detail screen

Logo coverage is asset-driven: exact supplied PNGs can be installed by stable service ID without changing catalog data or UI code. Missing logos never block the launcher.

## Routes

/login
/apps
/apps/service/:serviceId
/active
/active/:activationId
/wallet
/buy -> /wallet
/notifications
/support
/account

## Current catalog

The backend exposes the 216-service India/INR catalog from the 2026-09-25 master list. Service IDs are stable slugs, so logo assets and UI state are not coupled to catalog order.

## Build sequence

Phase 0 — Architecture freeze: completed.
Phase 1 — Frontend foundation: completed.
Phase 2 — Apps launcher: completed.
Phase 3 — Service and activation: next.
Phase 4 — Wallet, notifications, support, account.
Phase 5 — Production certification.
