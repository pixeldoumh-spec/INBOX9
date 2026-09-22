# TASK-008 — Client-facing terminology and marketplace presentation cleanup

## Status

Implemented on `agent/task-008-client-terminology-cleanup`.

## Client experience changes

The browser-facing product no longer exposes implementation-oriented "India", "Indian", "indan", or "synthetic" wording.

Updated client presentation:
- Brand label: `OTP MARKETPLACE`
- Auth copy: generic marketplace wording
- Marketplace hero: `Virtual numbers, built for speed.`
- Inventory label: `Live inventory`
- Marketplace kicker: `MARKETPLACE / +91`
- Purchase detail: `Number format: +91`
- Removed the country flag/country badge from the sidebar.
- Renamed the server-note CSS hooks to neutral `server-note` names.

The `+91` number format remains because it is part of the displayed number format and is required for the current marketplace presentation.

## Client reliability fix

The browser previously referenced an undefined `SYNTHETIC_SERVERS` fallback. The client now has a defined `MARKET_SERVERS` fallback matching the 5,000-slot / 11-server partition:
- 5,000 total slots
- 11 servers
- first 6 servers: 455 slots
- final 5 servers: 454 slots

This fallback is only a client display model. The API remains authoritative for live availability and reservations.

## Architecture boundary

Only the client-facing language and presentation were changed. Internal backend/database terminology remains unchanged because the engine is still synthetic-only and is not a real telecom provider.

No changes were made to wallet, activation state transitions, reservations, provider adapters, OTP timing, or service catalog behavior.
