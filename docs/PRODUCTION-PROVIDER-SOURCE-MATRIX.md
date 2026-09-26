# Production Provider Source Matrix

Last reviewed: 2026-09-26

INBOX9 currently has eight candidate sources from the India +91 research pass. They are intentionally split into **production-authorized API providers** and **public/shared sources**.

## Production-authorized API adapters

| Source | Adapter key | API mode | Credential | Production status |
| --- | --- | --- | --- | --- |
| ASMS.ai | `asms` | Private paid REST API | `INBOX9_ASMS_API_KEY` | Adapter installed; routing remains disabled until credentials and service mappings are verified |
| PVAPins | `pvapins` | Authenticated REST API | `INBOX9_PVAPINS_API_KEY` | Adapter installed; routing remains disabled until credentials and service mappings are verified |
| SMS Verification Number | `sms-verification-number` | Authenticated activation API | `INBOX9_SVNUMBER_API_KEY` | Adapter installed; routing remains disabled until credentials and service mappings are verified |

These APIs are server-side integrations. API keys must never be exposed to the customer browser.

ASMS.ai documents a paid REST API for ordering a private number and polling its SMS, with India/private-number support described on its India page.

PVAPins documents an authenticated REST API for service/country inventory, number orders and OTP polling, with an idempotency header for order creation.

SMS Verification Number documents `getNumber`, `getStatus`, `setStatus`, balance and service/country discovery through its activation API.

## Public/shared sources

| Source | Current role | Reason |
| --- | --- | --- |
| Receive-SMS.io | Availability/reference only | Public shared inbox; no documented private fulfillment API found |
| SMS24.me | Availability/reference only | Public shared inbox; no documented private fulfillment API found |
| OnlineSIM free numbers | Test/reference only | Official free-number API exists, but its free numbers and SMS are public/shared |
| 7SIM | Availability/reference only | Public/shared free-number pages; no documented production fulfillment API found |
| ReceiveSMS.co | Availability/reference only | Public/shared inboxes; current India availability has been volatile |

The public/shared sources are **not routed into customer fulfillment**. INBOX9 does not scrape their public inboxes or automatically harvest third-party OTPs.

OnlineSIM explicitly documents that its free-number API exposes public numbers and public messages and recommends those numbers for testing rather than personal/sensitive use.

## Production routing rule

1. Synthetic remains the current live production provider.
2. The three authorized API adapters are installed but **not active routes**.
3. A provider can become an active production route only after:
   - credentials are present in Render;
   - the provider health check is successful;
   - country/service mappings are verified against the provider's live catalog;
   - pricing/stock/reconciliation behavior is tested;
   - an explicit route change is applied and verified.
4. Public/shared sources remain outside fulfillment.

This keeps the current 90-service production catalog stable while allowing approved external providers to be introduced without resurrecting the retired NumberOTP/VirtualSMS integrations.
