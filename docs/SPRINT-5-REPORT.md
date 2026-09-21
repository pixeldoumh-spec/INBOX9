# INBOX9 Sprint 5 — Admin Control Center

## Status

Implementation complete. Live PostgreSQL verification remains an infrastructure task because this execution environment does not provide a PostgreSQL instance.

## Delivered

- Admin-only navigation and control center
- Overview metrics
- Pending UTR recharge queue with approve/reject actions
- User directory
- Service pricing, stock, availability and active controls
- Activation monitor
- Wallet ledger viewer
- Provider registry/health viewer
- Append-only audit log viewer
- `005_admin_ops.sql` migration
- Audit recording for service changes and recharge review actions
- Development-only local admin preview flag

## Production APIs

- `GET /api/admin/overview`
- `GET /api/admin/recharges`
- `POST /api/admin/recharges/:id`
- `GET /api/admin/users`
- `GET /api/admin/services`
- `PATCH /api/admin/services/:id`
- `GET /api/admin/activations`
- `GET /api/admin/ledger`
- `GET /api/admin/providers`
- `GET /api/admin/providers-health`
- `GET /api/admin/audit`

## Security properties

- All admin endpoints require an authenticated session.
- Admin endpoints require database role `admin`.
- Users/activations/ledger data are server-side reads from PostgreSQL.
- Service updates are validated and audited.
- Recharge approval is server-side and results in the existing wallet ledger credit transaction.
- No plaintext passwords or provider credentials are exposed to the admin UI.

## Verification

Run:

```bash
npm run check
npm test
```
