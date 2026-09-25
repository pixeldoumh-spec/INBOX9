-- INBOX9 Sprint 7: production integrity checks and operational indexes
BEGIN;

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_recharge_reviewed_by ON recharge_requests(reviewed_by, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_activations_user_status ON activations(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activations_provider_status ON activations(provider_id, status, updated_at DESC);

-- Production databases must not contain orphaned activations. The constraint is
-- validated after existing data has been audited; NOT VALID keeps migrations safe
-- for an existing database while making the requirement explicit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activations_user_required' AND conrelid = 'activations'::regclass
  ) THEN
    ALTER TABLE activations ADD CONSTRAINT activations_user_required CHECK (user_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

INSERT INTO schema_migrations(version) VALUES ('006_production_integrity') ON CONFLICT DO NOTHING;
COMMIT;
