# INBOX9 Sprint 3 — Wallet + UPI Recharge

## Status
Implementation complete. Production database verification remains pending until a PostgreSQL instance is provisioned.

## Product rules
- INBOX9 account authentication uses email + password only.
- No OTP is used for INBOX9 login or registration.
- New users must register before login.
- New users start with ₹0 wallet balance.
- Users must recharge before purchasing services.

## Recharge rules
- Minimum recharge: ₹100
- Maximum recharge: ₹5,000
- Payment method: UPI
- UPI ID: `8106204597@ptyes`
- Supplied QR is served at `/payment-qr.jpg`.
- User pays externally, then submits the UTR/transaction reference.
- Submission creates a `Pending` recharge request.
- Pending requests never credit the wallet.
- UTR is globally unique in PostgreSQL.
- An authorized admin can approve or reject a pending request.
- Approval credits the wallet exactly once and creates an immutable ledger entry.

## Wallet rules
- PostgreSQL is authoritative when `DATABASE_URL` is configured.
- Wallet balances are stored in paise using BIGINT.
- Ledger entries are immutable by database trigger.
- Activation purchase debits the wallet inside the same database transaction that creates the activation.
- Insufficient balance aborts the transaction.
- Activation cancellation credits a refund in the same transaction.
- Browser/localStorage balance is no longer authoritative.

## API
- `GET /api/wallet`
- `GET /api/recharges`
- `POST /api/recharges`
- `GET /api/admin/recharges` (admin)
- `POST /api/admin/recharges/:id` (admin)

## Admin
Promote an existing account explicitly in PostgreSQL:

```sql
UPDATE users SET role='admin' WHERE email='admin@example.com';
```

Approve:

```json
{"decision":"approve"}
```

Reject:

```json
{"decision":"reject","reason":"Payment could not be verified"}
```

## Verification
- JavaScript syntax checks: PASS
- Existing automated tests: 2/2 PASS
- Local HTTP auth/recharge/wallet flow: PASS
- Unknown login rejected until signup: PASS
- Duplicate registration rejected: PASS
- New account wallet starts at ₹0: PASS
- Pending UTR does not credit wallet: PASS
- Insufficient wallet blocks activation: PASS
- QR asset served successfully: PASS
- Live PostgreSQL integration: PENDING infrastructure
