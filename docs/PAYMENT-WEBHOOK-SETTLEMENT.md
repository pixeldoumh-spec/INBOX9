# INBOX9 Payment Webhook Settlement

## Production safety model

The payment webhook endpoint is provider-neutral. An external gateway adapter must normalize its signed callback into the INBOX9 contract:

- `eventId`: provider event identifier.
- `eventType`: `payment.succeeded` or `payment.failed`.
- `data.rechargeId`: the INBOX9 recharge request.
- `data.amountPaise`: integer INR amount in paise.
- `data.currency`: `INR`.
- `data.utr`: optional; when supplied it must match the submitted UTR.
- `data.externalReference`: optional gateway reference.

The raw request body is authenticated using HMAC-SHA256:

`X-INBOX9-Signature: t=<unix-seconds>,v1=<hex-sha256-hmac>`

The signed input is `<timestamp>.<raw-body>`, and the timestamp is checked against a bounded replay window.

## Settlement semantics

Webhook processing is transactional:

1. Claim `(provider,eventId)` with a database uniqueness constraint.
2. Lock the recharge row.
3. Validate recharge reference, amount, currency and optional UTR.
4. For a pending successful payment, lock the wallet.
5. Credit the wallet and append exactly one immutable recharge ledger credit.
6. Mark the recharge approved and persist normalized verification fields.
7. Record payment reconciliation and audit events.
8. Mark the webhook event processed.

A duplicate event with the same payload is acknowledged without another wallet credit. Reusing the same event ID with a different payload is rejected. Events arriving after a recharge is already terminal are ignored and never reverse an existing decision.

Failed payment events reject a pending recharge without touching the wallet.

## Configuration

- `INBOX9_PAYMENT_WEBHOOK_SECRET` — shared secret for the selected gateway adapter.
- `INBOX9_PAYMENT_WEBHOOK_PROVIDER` — provider identifier, default `generic`.
- `INBOX9_PAYMENT_WEBHOOK_TOLERANCE_SECONDS` — replay tolerance, default 300 seconds.

The endpoint returns HTTP 503 until a webhook secret is explicitly configured. No secret is committed to the repository.

## Admin reconciliation

`GET /api/admin/payment-reconciliation` now includes recent normalized webhook event outcomes and validation errors. Raw request bodies are not retained.

## Current boundary

This change completes the provider-neutral webhook verification and settlement-safety foundation. It does not select or enable a real payment gateway. Gateway-specific credentials, callback configuration, sandbox certification, and production enablement remain a separate controlled step.