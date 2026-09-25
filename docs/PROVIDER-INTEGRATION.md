# Provider Integration

## Current production mode

The synthetic provider is an internal QA/load-testing component only. Production customer fulfillment is fail-closed unless a real upstream provider is configured and routed for the requested service.

The repository also includes guarded external-provider adapters, but an adapter being installed does not by itself authorize customer-facing resale.

## NumberOTP availability

NumberOTP documents unauthenticated public endpoints for services, countries and prices. Its India country identifier is `22`. The prices response includes both an activation cost and current available count, with the public price feed cached by NumberOTP for up to about five minutes. citeturn167932search0turn167932search1turn167932search5

INBOX9 uses those public endpoints from the server, caches the combined India inventory briefly, and attaches a `liveAvailability.numberotp` object to matching catalog services.

This is **availability intelligence**, not INBOX9-owned stock. The customer UI labels it as NumberOTP live provider availability.

## NumberOTP fulfillment adapter

The authenticated adapter is installed but deliberately not activated by database routing.

Set:

```text
NUMBEROTP_API_KEY=<secret>
```

only when an INBOX9 operator is ready to authorize real provider purchases. NumberOTP's authenticated activation endpoint requires a Bearer API key and deducts provider balance immediately. citeturn693482search0turn779645search4

Do not enable a production service route to `numberotp` until cancellation/reconciliation behavior has been verified against the provider account. The current documented API reference does not expose a cancellation endpoint in the activation section, so INBOX9 intentionally fails closed instead of inventing one. citeturn779645search0turn779645search1

## Customer flow

Current production behavior:

```
INBOX9 service catalog
        |
        +-- real provider route -> customer purchase
        |
        +-- no real provider -> service marked unavailable
```

Internal QA behavior:

```
non-production
    |
    +-- synthetic fulfillment
```


Future, after explicit authorization and provider-account testing:

```
Customer
  |
  v
INBOX9 activation
  |
  v
Provider routing
  |
  v
NumberOTP authenticated activation
  |
  +--> status polling / webhook
  |
  v
INBOX9 Active / Completed / Refunded
```

NumberOTP supports a Global Webhook for instant OTP delivery and signs webhook payloads with HMAC-SHA256. citeturn167932search0turn167932search1
