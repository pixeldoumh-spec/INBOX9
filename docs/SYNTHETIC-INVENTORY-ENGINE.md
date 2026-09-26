# Synthetic Inventory & OTP Engine

This module is an internal QA/load-testing generator. It creates deterministic,
non-routable synthetic identities and six-digit OTPs for the 90 INBOX9 catalog services.

It deliberately does **not** create real telephone numbers, send SMS, reserve
telecom inventory, or call third-party verification endpoints.

## Capacity

The generator supports up to 5,000 synthetic identities per catalog service,
for 450000 synthetic identities across the current 90 services.

Inventory is generated on demand rather than storing 450000 slot rows.
A durable reservation row is created only for an allocated synthetic slot, so the
database tracks live ownership without materializing the entire pool. PostgreSQL
enforces uniqueness for each (service, slot) while the activation is Reserved.
Terminal activation states release the reservation; a collision is retried with
a fresh synthetic slot.

### Server issuance

Every synthetic reservation is assigned an internal synthetic server before its
slot is generated. Normal synthetic flow asks the server pool to issue a server
automatically; an explicit server can still be pinned for non-production QA.
The assigned server and slot are persisted in provider metadata so the durable
synthetic-slot reservation can validate that the slot belongs to the issued server.

## Verification

Run:

```bash
npm run synthetic:smoke
```

The smoke script validates all 90 services, the selected per-service capacity,
identity uniqueness, deterministic OTP generation, and the 11-server partition.

## Accuracy note

This is a deterministic rules-based simulator, not an ML model. Because the
output is derived from a cryptographic hash and covered by exact contract tests,
we can validate reproducibility of the simulator's expected outputs. Durable
slot reservations additionally make concurrent allocation state database-authoritative.
No real-world SMS delivery accuracy is implied.
