# INBOX9 Issue 4 — Wallet Reconciliation & Financial Integrity

Status: COMPLETE
Version: 0.8.3

## Problem
The wallet balance is an aggregate while the immutable wallet ledger is the accounting history. A production system must continuously verify that the two agree and must detect drift immediately.

## Changes
- Added migration `009_wallet_reconciliation.sql`.
- Added durable reconciliation run and issue tables.
- Added a deferred PostgreSQL constraint trigger on ledger inserts. Application wallet mutations update the wallet and then append the matching ledger entry in the same transaction; the trigger verifies that `wallet.balance_paise == SUM(credits) - SUM(debits)` before commit.
- Added `api/_lib/wallet-reconciliation.js` for full reconciliation and issue reporting.
- Added admin endpoint `GET/POST /api/admin/wallet-reconciliation`.
- Extended the existing internal reconciliation job to run wallet reconciliation every minute after provider/idempotency reconciliation.
- Reconciliation is read-only with respect to wallet balances: it records mismatches rather than silently repairing financial data.

## Safety rule
A mismatch is never auto-corrected. Financial state requires investigation. An administrator can inspect the recorded balance, ledger-derived balance, difference, user and run ID.

## Launch requirements
- Run migration 009 on staging and production PostgreSQL.
- Confirm the first reconciliation run is `Passed`.
- Configure `CRON_SECRET` (with `INTERNAL_CRON_SECRET` retained as a local/manual compatibility fallback) and verify the scheduled job.
- Investigate and resolve any open reconciliation issues before enabling real-money traffic.
