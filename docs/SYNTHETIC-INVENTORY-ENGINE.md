# Synthetic Inventory & OTP Engine

This module is an internal QA/load-testing generator. It creates deterministic,
non-routable synthetic identities and six-digit OTPs for the 216 INBOX9 catalog services.

It deliberately does **not** create real telephone numbers, send SMS, reserve
telecom inventory, or call third-party verification endpoints.

## Capacity

The generator supports up to 5,000 synthetic identities per catalog service,
for 1,080,000 synthetic identities across the current 216 services.

Inventory is generated on demand rather than storing 4,160,000 slot rows.
A durable reservation row is created only for an allocated synthetic slot, so the
database tracks live ownership without materializing the entire pool. PostgreSQL
enforces uniqueness for each (service, slot) while the activation is Reserved.
Terminal activation states release the reservation; a collision is retried with
a fresh synthetic slot.

## Verification

Run:

```bash
npm run synthetic:smoke
```

The smoke script validates all 216 services, the selected per-service capacity,
identity uniqueness, deterministic OTP generation, and the 11-server partition.

## Accuracy note

This is a deterministic rules-based simulator, not an ML model. Because the
output is derived from a cryptographic hash and covered by exact contract tests,
we can validate reproducibility of the simulator's expected outputs. Durable
slot reservations additionally make concurrent allocation state database-authoritative.
No real-world SMS delivery accuracy is implied.
