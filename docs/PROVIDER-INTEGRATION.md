# Provider Integration

## Current production mode

INBOX9 is currently a **synthetic-only fulfillment system**.

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

The provider gateway remains a generic fulfillment boundary. The repository currently registers only:

- `synthetic`

The gateway exposes the common operations `listServices`, `reserveNumber`, `getActivation`, `cancelActivation`, and `health`, plus explicit capability flags.

No external provider credentials, external-provider configuration, or external-provider readiness workflow is required for the current deployment.

## Production safety

Production customer activation is intentionally served by the synthetic engine. Internal server identifiers remain implementation data and are not exposed as customer-facing provider identifiers.

Future provider integrations must be added as a separate, explicitly reviewed change with provider authorization, inventory mapping, allocation/reconciliation design, and regression coverage. They are not part of the current runtime.
