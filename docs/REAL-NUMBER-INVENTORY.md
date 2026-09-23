# Real Number Inventory v1

## Goal

Move INBOX9 from synthetic stock counts toward a real inbound-number inventory without putting unapproved telecom numbers into customer stock.

## Architecture

```text
Approved number provider
        |
        | assigned-number API
        v
provider adapter
        |
        v
number_inventory (server-only)
        |
        +--> availability / reservation
        |
        +--> inbound SMS webhook
        |
        v
customer activation
```

## Safety gate

A provider may expose an API that lists numbers and accepts inbound SMS without granting INBOX9 the right to resell or expose those numbers to third parties. INBOX9 must therefore require a written provider agreement permitting the intended customer-facing/resale use before a provider adapter is activated.

For example, Exotel's current public API can list assigned ExoPhones and reports SMS capability, country and region. However, Exotel's standard Terms state that domestic customers may not resell the right to use the product, and Exotel states that ExoPhone numbers are owned by Exotel/downstream providers. Therefore Exotel is **not enabled as an INBOX9 resale source under its standard terms**. A separate written agreement would be required before using it for this marketplace. citeturn0search0turn1search0turn1search1

## Database model

`number_inventory` stores:

- provider + provider number ID
- actual phone number
- India country/telecom region
- SMS/voice capability
- lifecycle state (`available`, `reserved`, `active`, `cooldown`, `disabled`)
- optional service assignment
- activation reservation
- provider metadata
- last synchronization time

The table is server-only and is not exposed to `anon` or `authenticated` clients.

## What is deliberately not done yet

- No provider credentials were added.
- No real numbers were imported.
- No production Supabase schema was changed.
- No customer purchase is routed to a real provider.
- No number is advertised as real until a provider-authorized sync populates the table.

## Provider onboarding checklist

1. Obtain a provider account that explicitly permits INBOX9's intended use/resale model.
2. Confirm Indian telecom/regulatory requirements with the provider and qualified counsel.
3. Obtain API credentials and webhook documentation.
4. Implement the provider adapter using `createNumberInventoryProvider()`.
5. Run a test sync into staging.
6. Verify inbound SMS delivery and message-to-number correlation.
7. Add reservation/release reconciliation.
8. Enable a small production pool only after the provider agreement and compliance review are complete.
