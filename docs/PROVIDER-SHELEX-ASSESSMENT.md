# Shelex free-otp-api assessment

## Decision

Shelex is wired into INBOX9 only as a **diagnostic/test adapter**. It is not an activation provider and must not be routed to paid customer services.

The upstream project describes itself as a service that aggregates free/public SMS-testing sources. Its API exposes country discovery, public phone-number lists, and SMS lookup for a number. The implementation uses Puppeteer and Redis to scrape/cache those sources.

That model is incompatible with INBOX9's production provider contract because a paid activation needs an authorized provider that can establish exclusive/reliable ownership of a number for the activation lifecycle. A public number list does not establish that guarantee.

## What is wired

- provider adapter key: `shelex-test`
- connectivity/health check: `GET /countries`
- registry discovery: enabled
- production customer activation: disabled
- provider reservation: disabled
- activation polling: disabled
- cancellation: disabled

## Configuration

`SHELEX_TEST_BASE_URL=https://otp-api.shelex.dev/api`

This setting is for diagnostics only. Do not route paid services to `shelex-test`.

## Production path

A real provider should expose server-to-server, authorized semantics for:

1. reserve/lease a number
2. return a stable provider activation ID
3. report activation status/OTP
4. cancel/release the number
5. support idempotency and operational reconciliation

Once an authorized provider with those guarantees is selected, its adapter can be added to `provider-registry.js` without changing INBOX9's wallet, activation, expiration, or reconciliation layers.


## Database registration

Migration `013_shelex_test_provider.sql` registers the adapter as `active=FALSE`. This keeps it visible to administrators after migrations without allowing it to become a customer routing target.
