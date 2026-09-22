# TASK-004 — Wallet / Recharge Integrity Audit

**Date:** 2026-09-22  
**Verification target:** `main` at commit `d1aeddb34a043fc9f46d1930538967d8c3ecbd3e`  
**Scope:** wallet balance, immutable ledger, UPI recharge requests, admin review, reconciliation events, activation debits/refunds, authorization.

## Executive result

The wallet path has several strong integrity controls already in place:

- wallet mutations and ledger entries are performed transactionally;
- wallet ledger rows are immutable;
- the ledger uses a unique `(reference_type, reference_id)` key;
- recharge UTRs have a case-insensitive unique database index;
- admin recharge review locks the recharge row and only processes `Pending` requests;
- activation debit locks the user's wallet row before checking and decrementing the balance;
- activation refunds and recharge credits write corresponding ledger entries;
- a deferred PostgreSQL trigger checks wallet aggregate balance against the ledger before commit.

No confirmed double-credit path was found in the reviewed approval/debit/refund flows.

## Findings

### P1 — Approval audit trail can claim verification without capturing verification evidence

**Status: CONFIRMED**

`reviewRecharge()` accepts an approval with `verification.amountPaise`, `verification.utr`, and `verification.externalReference` all omitted. The function then:

1. credits the wallet;
2. writes a `wallet_ledger` credit;
3. writes a `verified` payment-reconciliation event;
4. writes an `approved` payment-reconciliation event;
5. records an `recharge.approve` audit event.

When no verification fields are supplied, those events fall back to the submitted recharge amount and submitted UTR. This means the stored record says the payment was verified even though the system captured no independent verification evidence.

**Impact:** The accounting can remain correct while the payment-review audit trail is weaker than its wording suggests.

**Recommended fix:** Either require explicit verification evidence for approval (at minimum verified UTR and verified amount, with an optional external reference), or change the event semantics so that an admin approval without evidence is recorded as a distinct operational decision rather than a verified payment.

### P2 — Duplicate-UTR race is database-safe but API error classification is not deterministic

**Status: CONFIRMED, LOW RISK**

`createRecharge()` first checks for an existing UTR and then inserts. Two concurrent requests can both pass the read, but the unique index `uq_recharge_utr` remains the final concurrency authority. One insert will win and the other will receive a PostgreSQL unique-constraint error.

The API's duplicate detection currently looks only for the phrase `already been submitted`. A database race loser therefore returns the generic 400 path rather than the intended 409 duplicate response.

**Impact:** No duplicate record is created, but clients receive inconsistent error semantics under concurrency.

**Recommended fix:** Catch PostgreSQL unique-violation (`23505`) for the UTR constraint specifically and map it to `409` with a stable error code such as `DUPLICATE_UTR`.

### P2 — Approval/rejection paths lack dedicated automated concurrency tests

**Status: GAP IN TEST COVERAGE**

The application logic uses row locking and status guards, which are appropriate. However, the existing repository E2E script tests a normal approval but does not exercise concurrent approve-vs-approve or approve-vs-reject attempts against the same pending recharge.

**Recommended fix:** Add a PostgreSQL integration test that concurrently submits two terminal review operations against one Pending recharge and asserts exactly one transition, exactly one wallet credit (for approval), exactly one recharge ledger entry, and a single terminal status.

### P2 — Flagged-payment verification fields are stored without the same validation used for approvals

**Status: CONFIRMED, LOW RISK**

`flagRecharge()` records `verification.amountPaise`, `verification.utr`, and `verification.externalReference` without applying the approval-path validation rules. Flagging does not credit the wallet, so this is not a balance-integrity defect, but it permits malformed observational data into the reconciliation trail.

**Recommended fix:** Reuse the same normalization/validation helper for observed payment fields across verify and flag operations.

## Positive controls verified

### UTR uniqueness

Migration `003_wallet_recharge.sql` creates a case-insensitive unique index:

`CREATE UNIQUE INDEX ... uq_recharge_utr ON recharge_requests(LOWER(utr))`

This is stronger than an application-only duplicate check.

### Immutable ledger

The wallet ledger has a database trigger preventing UPDATE/DELETE operations.

### Reference uniqueness

`wallet_ledger` has `UNIQUE(reference_type, reference_id)`, which gives each accounting reference one ledger entry.

### Wallet/ledger invariant

Migration `009_wallet_reconciliation.sql` installs a deferred constraint trigger comparing the recorded wallet balance with the sum of immutable ledger entries before the transaction commits.

### Approval concurrency

`reviewRecharge()` obtains `FOR UPDATE` on the recharge row and refuses non-`Pending` rows. This prevents a second terminal decision from crediting the wallet.

### Activation debit concurrency

`debitForActivation()` obtains `FOR UPDATE` on the wallet before checking and decrementing the balance.

### Admin boundary

The recharge mutation route requires an authenticated admin role and requires PostgreSQL for persistent admin recharge operations.

## Scope boundaries

This audit did not inspect live bank/UPI-provider data because INBOX9 currently has no external payment provider integration in this synthetic/development architecture.

It also does not treat the absence of a daily monetary limit as a defect; the current request-rate limit and per-recharge amount bounds are separate operational controls.

## Recommended implementation sequence

1. Make the approval audit trail accurately distinguish verified evidence from admin decision.
2. Add PostgreSQL concurrency tests for recharge terminal decisions.
3. Normalize duplicate-UTR unique-violation handling to a stable 409 API error.
4. Reuse payment-observation validation for flagged requests.

## Handoff

STATUS: COMPLETE — HANDOFF READY
TASK: TASK-004
BRANCH: agent/task-004-wallet-integrity
COMMIT: <this report commit>
PR/ISSUE: 9
REPORT: .agents/reports/TASK-004-wallet-integrity-audit.md
TESTS: Read-only audit; existing repository E2E inspected, no new test execution from this audit branch
CHANGED FILES: .agents/reports/TASK-004-wallet-integrity-audit.md
LIMITATIONS: No live PostgreSQL concurrency run; no external bank/UPI provider verification environment
