# Provider Integration

## Current production mode

INBOX9 remains a **synthetic-only live fulfillment system** while the newly installed external adapters are kept dormant until credentials, service mappings, pricing and reconciliation checks are verified.

The active fulfillment adapter is the internal synthetic engine. It issues an internal synthetic server, allocates a synthetic slot for the requested service, and generates the test number/OTP lifecycle without connecting to a telecom or external SMS provider.

## Synthetic server flow

```text
Customer
  |
  v
INBOX9 service
  |
  v
Synthetic server issuer
  |
  +--> server-1 ... server-11
  |
  v
Synthetic adapter
  |
  v
MockAPI / synthetic fulfillment
  |
  v
+91 synthetic number + OTP lifecycle
```

Every synthetic reservation receives an internal server assignment before its slot is generated. A specific server can be selected only for non-production QA requests; normal customer allocation receives an issued server automatically.

Synthetic server capacity is currently defined by the runtime synthetic inventory engine and enforced by the durable PostgreSQL slot-reservation table.

## Adapter boundary

The provider gateway remains a generic fulfillment boundary. The repository currently registers these fulfillment adapters:

- `synthetic`
- `asms`
- `pvapins`
- `sms-verification-number`

Only `synthetic` is currently routed in production. The external adapters require server-side credentials and an explicit row in `provider_service_mappings` before a service can be routed to them.

The gateway exposes the common operations `listServices`, `reserveNumber`, `getActivation`, `cancelActivation`, and `health`, plus explicit capability flags.

External provider credentials are now represented as server-only Render secrets, but the current deployment remains synthetic-only until Phase 7 readiness and approved provider lifecycle evidence are complete.

## Production safety

Production customer activation is intentionally served by the synthetic engine. Internal server identifiers remain implementation data and are not exposed as customer-facing provider identifiers.

Future provider integrations must be added as a separate, explicitly reviewed change with provider authorization, inventory mapping, allocation/reconciliation design, and regression coverage. They are not part of the current runtime.


## Source finalization

The production source matrix is documented in `docs/PRODUCTION-PROVIDER-SOURCE-MATRIX.md`.

The eight researched sources are split into three authorized API providers (ASMS.ai, PVAPins and SMS Verification Number) and five public/shared sources (Receive-SMS.io, SMS24.me, OnlineSIM free numbers, 7SIM and ReceiveSMS.co). Public/shared sources are not customer fulfillment routes and are not scraped for OTP interception.
