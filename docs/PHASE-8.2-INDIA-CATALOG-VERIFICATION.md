# Phase 8.2 — Live India Catalog Verification

Phase 8.2 adds a non-billable India catalog verification path for the three authorized external adapters.

## Provider catalog calls

- ASMS.ai: `GET /api/v1/otp/services?country=in` with a Bearer API key. The provider documents this endpoint as the live service/pricing/stock catalog. citeturn737512search1
- PVAPins: `GET /api/v1/services` for service codes plus `GET /api/v1/operators?country=IN` for country-specific live route availability, price and stock. The provider explicitly documents the country-only operators mode for bulk availability. citeturn846066search1
- SMS Verification Number: `getCountryAndOperators` to resolve India's country ID, followed by `getServicesAndCostWithStatistics` for service code, name, price, quantity and delivery statistics. The provider documents these as catalogue endpoints and requires the API key to remain secret. citeturn245775search0turn245775search1

These calls do not reserve a number and therefore do not create a provider-side purchase.

## Verification rules

A provider is reported as `catalog_verified` only when:

1. Its server-side credential exists.
2. The adapter responds successfully.
3. The response explicitly identifies the requested country as India.
4. The India catalog contains at least one service.
5. No returned route explicitly identifies a different country.

An empty, mismatched or malformed India response becomes a catalog blocker. This prevents an HTTP-success response from being mistaken for usable India inventory.

## Production boundary

Phase 8.2 does not enable external routing, create provider mappings, or perform billable number reservations. Phase 7 readiness continues to require verified mappings, deterministic cancellation where required, reconciliation health and an approved lifecycle canary before external activation.

The synthetic provider remains the live production safety lane.
