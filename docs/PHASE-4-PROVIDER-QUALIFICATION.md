# Phase 4 — Provider Qualification & Service Mapping

Phase 4 establishes the production qualification gate for external providers.

## Qualification rules

- The live 90-service INBOX9 catalog remains the authoritative customer catalog.
- External provider service codes are never guessed from names.
- Provider catalogs are read from the provider's documented server-side API.
- An exact normalized service-name match is only a candidate; it is not automatically approved.
- A verified mapping must contain a provider service code that exists in the current provider catalog.
- External provider routes cannot be activated until an approved mapping exists.
- Synthetic remains the only live production route until an external provider is explicitly qualified.

## Provider-specific qualification

### ASMS.ai

The current REST API exposes service catalogs by country and uses explicit service identifiers. Its current API documentation lists country pools such as `us1`, `us`, `uk`, and `au`; INBOX9 therefore does not assume the paid API supports India just because ASMS also has public/free shared India numbers. An actual API catalog response is required before an India mapping can be approved.

### PVAPins

The current REST API documents `GET /api/v1/services` for service codes and `GET /api/v1/operators` / `GET /api/v1/numbers` for live availability, price and operator information. The API also documents `Idempotency-Key` for order creation.

### SMS Verification Number

The current API documents India as country ID `22`, and `getServicesAndCost` / `getServicesAndCostWithStatistics` return service code, name, current price and available quantity. `getNumber`, `getStatus` and `setStatus` provide the activation lifecycle.

## Admin qualification endpoint

`GET /api/admin/provider-qualification` returns:

- the 90 active services;
- every installed provider and its qualification state;
- credential status;
- live provider catalog count when configured;
- exact-name candidate mappings;
- verified mappings;
- stale mappings;
- ambiguous matches.

`POST /api/admin/provider-qualification` with `action=verify-mapping` saves a mapping only after the submitted provider service code is found in the provider's current live catalog.

## Current production state

At Phase 4 implementation time no external provider credentials are installed in the Render environment, so the live external mapping count remains zero. This is intentional: it prevents unverified service codes from reaching customer activation.

The next operational step is to configure an authorized provider account, run the qualification endpoint, review exact matches and live stock/price, and then explicitly approve mappings before Phase 5 controlled routing.