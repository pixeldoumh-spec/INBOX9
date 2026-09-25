# VirtualSMS Provider Readiness Runbook

## Goal

Verify a legitimate VirtualSMS account before any INBOX9 customer-facing provider route is enabled.

This runbook deliberately separates **readiness verification** from **number purchasing**.

## 1. Provider-side prerequisite

Obtain:

- a VirtualSMS account/API key with authenticated API access;
- written authorization from VirtualSMS permitting INBOX9 to resell/redistribute the service;
- confirmation that India (+91) inventory is available for the intended service(s).

Do not place the API key or authorization document in the Git repository.

## 2. Add GitHub Actions Secrets

Open:

**GitHub → pixeldoumh-spec/INBOX9 → Settings → Secrets and variables → Actions → New repository secret**

Add:

`VIRTUALSMS_API_KEY` — the provider API key.

`VIRTUALSMS_BASE_URL` — optional; leave unset to use `https://virtualsms.io`.

`VIRTUALSMS_RESELLER_AUTHORIZED` — keep `false` until written resale authorization has been obtained and recorded by the operator; then set `true`.

`VIRTUALSMS_CANARY_ENABLED` — keep `false` during inventory discovery; set `true` only for an intentionally configured canary.

`VIRTUALSMS_ALLOWED_SERVICE_IDS_JSON` — start with exactly one INBOX9 service ID when preparing the first canary.

`VIRTUALSMS_SERVICE_MAP_JSON` — explicit JSON mapping from the INBOX9 service ID to the provider service code returned by the authenticated provider catalog.

Never use guessed provider service codes.

## 3. Run inventory verification

Open:

**GitHub → Actions → VirtualSMS provider preflight → Run workflow**

Select:

**mode = inventory**

Leave the service ID empty for the first run.

A successful run proves that the credential authenticates, the account endpoints respond, India (+91) is visible, and the provider service catalog can be read.

It does **not** allocate a number.

## 4. Validate the first service

After inventory verification, set exactly one explicit INBOX9 service mapping and allowlist entry.

Run the workflow again with:

**mode = canary-ready**

and supply the same service ID in **service_id**.

The workflow verifies that the mapped provider service actually exists in the authenticated provider catalog. It still cannot purchase a number because it forces `VIRTUALSMS_PREFLIGHT_ONLY=true`.

## 5. Only after readiness passes

The separate production canary procedure may then:

1. add the inactive provider record/route for the verified service;
2. keep the initial global VirtualSMS cap at 30 allocations;
3. keep the account/service concurrency limit at 10 active allocations;
4. perform one controlled real allocation;
5. verify OTP retrieval, completion, expiry and cancellation/refund behavior;
6. inspect wallet ledger, provider balance and Render logs;
7. stop immediately on any mismatch.

No automatic expansion from one verified service to the other catalog services is permitted.

## Current safety invariant

The readiness workflow is manual-only and sets `VIRTUALSMS_PREFLIGHT_ONLY=true`. The VirtualSMS adapter independently rejects purchase operations in preflight mode.

Therefore a readiness run is a verification operation, not a purchasing operation.
