# INBOX9 — Issue 5: UTR / Payment Reconciliation

Status: COMPLETE
Version: 0.8.4

## Delivered
- Durable payment reconciliation event trail.
- Submission, verification, approval, rejection and flag events.
- Verified amount/UTR/external reference fields on recharge requests.
- Approval can validate bank/payment evidence supplied by an authorized reviewer.
- Flagging is non-crediting and keeps a recharge pending for investigation.
- Admin reconciliation endpoint exposes status totals and flagged requests.
- Duplicate UTR remains protected by the existing database unique index.
- Wallet credit remains atomic with the approved recharge transaction.

## Financial safety
No UTR submission credits a wallet. A flagged or mismatched payment cannot be approved through the normal verification path when verified evidence is supplied. No automatic wallet credit is performed by reconciliation reporting.

## Production boundary
The application does not yet have a live bank/UPI provider connector, so automated bank-statement matching is intentionally not claimed. The architecture now records external references and verified payment evidence so a real authorized payment provider/reconciliation feed can be added without changing wallet accounting.

## Verification
- npm test: PASS
- npm run check: PASS
