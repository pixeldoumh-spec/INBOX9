-- INBOX9: restore the missing migration point by validating the user ownership constraint.
BEGIN;

-- Migration 003 intentionally introduced this constraint as NOT VALID so existing
-- databases could be audited safely. A fresh Supabase database has no legacy rows,
-- and deployment must enforce the invariant before customer traffic is enabled.
ALTER TABLE activations
  VALIDATE CONSTRAINT activations_user_required;

INSERT INTO schema_migrations(version)
VALUES ('013_auth_constraint_validation')
ON CONFLICT DO NOTHING;

COMMIT;
