# INBOX9 Frontend Architecture — v1

Status: Architecture frozen for Phase 1 foundation.

## Source basis

The supplied VirtualSMS analysis describes a mobile-first responsive app-shell/dashboard with a searchable icon-grid service catalog, persistent navigation, REST-backed application data, and live activation events. The supplied reference also emphasizes an app-like service launcher.

For INBOX9, the primary interaction is separated into independent routes:

Apps launcher
  -> Service detail
  -> Activation
  -> OTP/status

## Non-negotiable boundaries

1. The frontend is an independent application under /frontend.
2. Frontend code communicates with the backend only through same-origin /api/* HTTP APIs.
3. Frontend code must not import backend implementation modules.
4. Service catalog data comes from GET /api/services.
5. Server data/cache state is separate from session state and local UI state.
6. Activation live updates use a transport abstraction so polling can later be replaced by WebSocket.
7. Apps Home and Service Detail are different routes/screens.
8. Visual design must not dictate backend architecture.

## Route model

/login
/apps
/apps/service/:serviceId
/active
/active/:activationId
/wallet
/notifications
/support
/account

## Application layers

src/
  app/           bootstrap, router, providers
  api/           HTTP/API contract functions only
  features/      user-facing feature modules
  state/         minimal UI/session state
  realtime/      activation event transport abstraction
  components/    reusable presentation primitives
  styles/        tokens and global CSS

## State ownership

Server state: TanStack Query owns services, wallet, activations, notifications, support, and account data.

Session state: a small Zustand store owns authenticated user state and bootstrap state.

UI state: local/transient state only, such as search text, filters, open controls, and temporary feedback.

## Core user journey

/apps
  |
  | tap service icon
  v
/apps/service/:serviceId
  |
  | Get Number
  v
/active/:activationId
  |
  | live status
  v
OTP / completion

## API boundary

GET  /api/health
GET  /api/services
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
GET  /api/wallet
GET  /api/activations
POST /api/activations
GET  /api/activations/:id
POST /api/activations/:id/cancel
GET  /api/notifications
GET  /api/support
POST /api/support

## Service model

The backend currently exposes an 832-service India/INR catalog. The frontend type models only presentation and purchase fields and intentionally excludes provider internals.

## Realtime model

activationStream.subscribe(activationId, listener)

Phase 1 defines the interface. Phase 3 will use controlled polling first and keep the transport replaceable.

## Build sequence

Phase 0 — Architecture freeze: completed.
Phase 1 — Frontend foundation: current.
Phase 2 — Apps launcher: next.
Phase 3 — Service and activation.
Phase 4 — Wallet, notifications, support, account.
Phase 5 — Production certification.
