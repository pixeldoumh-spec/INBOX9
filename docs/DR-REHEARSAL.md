# INBOX9 Disaster Recovery / Restore Rehearsal

This rehearsal validates the application's logical PostgreSQL backup and restore path against the same db/migrations tree used by the Render runtime.

## What it proves

The workflow starts an isolated PostgreSQL 17 instance, builds the schema with npm run db:migrate, seeds a deterministic production-shaped fixture covering authentication, wallets, immutable ledger, recharge/payment reconciliation, activations, provider operations, idempotency, support, notifications, recovery codes, sessions and audit data, then:

1. verifies the source database invariants;
2. creates a custom-format pg_dump;
3. restores the dump into a clean database with pg_restore;
4. runs the integrity verifier against the restored database;
5. reruns application migrations and proves they are idempotent;
6. verifies the restored database again;
7. deletes the dump before the GitHub runner is discarded.

## Scope and limitation

This is a logical restore rehearsal, not a managed Supabase point-in-time recovery test. The live production database is never dumped or modified.

When managed backup/PITR capability is available for production, schedule a separate operator-controlled restore drill into an isolated recovery project/database and run scripts/dr-verify.mjs against the recovered database.

## Recovery evidence

The workflow reports source integrity pass/fail, restore integrity pass/fail, migration replay idempotency, logical dump duration, logical restore duration, and dump size.

No database dump is retained as a GitHub Actions artifact because a backup contains application-shaped data.

## Production recovery runbook

1. Put customer mutations into the approved maintenance/fallback state.
2. Establish the latest valid backup or managed recovery point.
3. Restore into a new isolated PostgreSQL target.
4. Run scripts/dr-verify.mjs.
5. Run wallet reconciliation and inspect open reconciliation issues.
6. Run provider-operation reconciliation before re-enabling external provider traffic.
7. Only switch application traffic after schema, wallet, ownership and reconciliation invariants are verified.
8. Record RTO/RPO evidence and the incident timeline.
