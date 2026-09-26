# Phase 8.1 — Authorized Provider Credential Wiring

Phase 8.1 establishes the server-side credential contract for the three approved external adapters without activating external fulfillment.

## Providers

| Adapter | Render secret | Default API base |
| --- | --- | --- |
| ASMS.ai | `INBOX9_ASMS_API_KEY` | `https://asms.ai` |
| PVAPins | `INBOX9_PVAPINS_API_KEY` | `https://api.pvapins.com` |
| SMS Verification Number | `INBOX9_SVNUMBER_API_KEY` | `https://sms-verification-number.com/stubs/handler_api` |

The secret values are Render-only configuration. They are not committed to GitHub, exposed to the browser, or included in build-time frontend variables.

## Safety defaults

- `INBOX9_ENABLE_EXTERNAL_ROUTING=false`
- `INBOX9_ALLOW_NONCANCELLABLE_PROVIDER_RESERVE=false`
- Synthetic remains the only active production route.
- External adapters remain blocked until Phase 7 readiness gates are satisfied.
- Missing credentials fail closed with `PROVIDER_NOT_CONFIGURED`.

## Render configuration

The repository's `render.yaml` declares the three provider secret variables with `sync: false`. This makes the required secret slots explicit without storing values in source control.

For the current service, only the non-secret provider base URLs and the two disabled routing flags are safe to configure automatically. Actual provider API keys must be entered as confidential Render environment variables by the account owner after provider authorization.

## Verification

Phase 8.1 is considered wired when:

1. All three adapters resolve credentials only from server environment variables.
2. No customer-facing frontend bundle references a provider secret.
3. CI rejects committed provider-key assignments with non-empty values.
4. External routing remains disabled by default.
5. Missing credentials cause provider operations/readiness to fail closed.

This phase does not perform billable number reservations or activate an external provider.
