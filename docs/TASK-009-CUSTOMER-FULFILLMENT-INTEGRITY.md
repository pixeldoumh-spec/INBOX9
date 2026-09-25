# TASK-009 — Customer Fulfillment Integrity

## Objective

Remove customer-facing dependence on the internal synthetic/demo fulfillment model while keeping the existing application stable for development and QA.

## Implemented

- Production activation creation now fails closed before any provider reservation or wallet debit when the selected provider adapter is `synthetic`.
- Production activation status refresh also fails closed for active synthetic activations rather than generating or returning synthetic OTP lifecycle updates to customers.
- Customer activation payloads no longer expose provider IDs, synthetic reveal timestamps, or internal synthetic server identifiers.
- Customer Active UI no longer contains synthetic-number reveal/OTP timing logic.
- Customer notification timing no longer depends on synthetic reveal metadata.
- Activation validity text is provider-defined rather than hard-coded to the synthetic 25-minute lifecycle.
- Production service catalog responses now mark each service `purchasable=true` only when that service has an active non-synthetic provider route.
- Customer purchase buttons are disabled for services that do not currently have real-provider fulfillment.
- Automated regression coverage protects the above boundaries.

## Financial safety

The production provider check occurs before provider reservation and before the wallet debit transaction is entered. A missing real provider therefore cannot create a customer charge.

## Result

Production INBOX9 can still authenticate users, load the service directory, show wallet/order/support/account surfaces, and accept legitimate wallet operations, but it will not manufacture a number or OTP for a customer.

Until an authorized real provider is routed to a service, that service is presented as unavailable rather than as functioning simulated inventory.

## Next release gate

Connect and verify a legitimate real-number/SMS provider, then enable only the verified service routes. The synthetic engine remains available for non-production engineering and automated QA.