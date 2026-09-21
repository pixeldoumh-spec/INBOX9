# Synthetic Inventory & OTP Engine

This module is an internal QA/load-testing generator. It creates deterministic,
non-routable synthetic identities and six-digit OTPs for the 76 INBOX9 catalog
services.

It deliberately does **not** create real telephone numbers, send SMS, reserve
telecom inventory, or call third-party verification endpoints.

## Capacity

The generator supports up to 5,000 synthetic identities per catalog service,
for 380,000 synthetic identities across the current 76 services.

Inventory is generated on demand rather than stored as 380,000 database rows.
This keeps the test environment lightweight while allowing deterministic load
simulation.

## Verification

Run:

```bash
npm run synthetic:smoke
```

The smoke script validates all 76 services, the selected per-service capacity,
identity uniqueness, and deterministic OTP generation.

## Accuracy note

This is a deterministic rules-based simulator, not an ML model. Because the
output is derived from a cryptographic hash and covered by exact contract tests,
we can validate 100% reproducibility/correctness of the simulator's expected
outputs. No real-world SMS delivery accuracy is implied.
