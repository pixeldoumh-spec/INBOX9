# TASK-007 — Indian-format synthetic number generation

## Status

Implemented on `agent/task-007-indian-format-synthetic-number`.

## Purpose

INBOX9 remains fully synthetic. The activation display number now resembles an India mobile number without changing the underlying synthetic identity, slot reservation model, or OTP timing.

## Number model

- Display format: `+91 9XXXX XXXXX` (with the first digit deterministically selected from `6`, `7`, `8`, or `9`).
- Exactly 10 domestic digits are presented after `+91`.
- The display number is deterministically derived from the authoritative synthetic identity inputs: service + slot + capacity.
- The authoritative internal identity remains `SIM-IN-<service-token>-<slot>`.
- The display number is presentation data only. It is not assigned telecom inventory and must never be used for real-world routing or sent to a real SMS/verification provider.

## Preserved behavior

- Synthetic capacity remains 5,000 slots per service.
- Existing server partitioning and durable slot reservations are unchanged.
- Synthetic OTP generation is unchanged.
- Synthetic OTP availability remains exactly 20,000 ms after activation creation.

## Validation

Regression coverage verifies:

- deterministic number generation;
- India-style 10-digit domestic format;
- first digit constrained to 6–9;
- service/slot inputs produce distinct display values in representative cases;
- authoritative synthetic identity remains separate from display number;
- provider activation output uses the new format;
- 20-second synthetic OTP timing remains unchanged.

CI should run the full existing Node test suite and syntax checks through the repository workflow.
