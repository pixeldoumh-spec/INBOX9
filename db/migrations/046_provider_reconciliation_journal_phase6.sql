BEGIN;

-- Migration-history bridge for a remote Supabase version that is already
-- represented by the canonical provider reconciliation journal migration.
INSERT INTO schema_migrations(version)
VALUES ('046_provider_reconciliation_journal_phase6')
ON CONFLICT (version) DO NOTHING;

COMMIT;
