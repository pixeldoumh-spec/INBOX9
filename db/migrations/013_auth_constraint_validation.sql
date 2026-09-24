-- INBOX9: restore the missing migration point by validating the user ownership constraint.
BEGIN;

ALTER TABLE activations
  VALIDATE CONSTRAINT activations_user_required;

INSERT INTO schema_migrations(version)
VALUES ('013_auth_constraint_validation')
ON CONFLICT DO NOTHING;

COMMIT;
