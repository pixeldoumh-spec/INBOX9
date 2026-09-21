# INBOX9 — Shelex diagnostic integration v0.8.11

## Decision

Shelex `free-otp-api` is connected to the INBOX9 provider boundary only for server-side diagnostics. It is not a customer activation source and cannot be selected for paid reservations.

The upstream project documents country discovery, public phone-number lists, and SMS lookup over free/public SMS-testing sources. That source model does not provide the exclusive lease semantics required by INBOX9's paid activation lifecycle. citeturn830071search0

## Wiring completed

- `api/_lib/shelex-diagnostics.js`: server-side HTTP client with timeout handling.
- `api/_lib/shelex-test-provider.js`: provider-boundary adapter.
- `api/_lib/provider-registry.js`: adapter registration.
- `db/migrations/013_shelex_test_provider.sql`: inactive registry row.
- `scripts/shelex-smoke.mjs`: connectivity + India availability smoke check.

## Deliberate restrictions

The adapter exposes discovery/health only. `reserveNumber`, `getActivation`, and `cancelActivation` reject with `PROVIDER_UNSUPPORTED`.

No customer route, catalog route, wallet route, or activation route can select this provider because its database registry row is inactive.

The smoke check reads the country list and India public-number-list metadata/count only. It does not fetch or display SMS/OTP contents.

## Customer UI

Customer-facing navigation and content do not expose provider implementation, mock mode, diagnostic status, or test terminology. The internal provider name remains available only in source/administration metadata.

## Verification

- Full automated tests pass.
- Static syntax checks pass.
- Issue 9 local E2E remains green.
- The live Shelex smoke command was attempted in this environment but outbound DNS/network access failed (`fetch failed`). The command is ready to run from staging/deployment infrastructure with `npm run provider:shelex-smoke`.
