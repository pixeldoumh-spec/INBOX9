# INBOX9 Synthetic Fulfillment Engine

INBOX9 uses a single internal fulfillment engine. There are no runtime connections to third-party virtual-number or SMS/OTP providers.

## Engine contract

createProviderAdapter({ listServices, reserveNumber, getActivation, cancelActivation, health })

The sole registered implementation is synthetic, backed by api/_lib/synthetic-otp.js and api/_lib/synthetic-provider.js.

## Capacity

The engine supports up to 5,000 synthetic slots per catalog service (380,000 across the current 76-service catalog) and generates activations on demand.

## Deterministic OTPs

OTP values are generated from service identity, synthetic slot, and activation nonce using a cryptographic hash. The same inputs produce the same six-digit OTP, which makes automated testing reproducible.

## Lifecycle

The engine implements reserve, status, completion, expiry, cancellation, and health operations locally. No outbound provider network calls are performed by the activation lifecycle.
