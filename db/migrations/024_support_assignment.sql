-- INBOX9: support ticket assignment
BEGIN;

ALTER TABLE support_requests
  ADD COLUMN IF NOT EXISTS assigned_admin_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_assigned_admin ON support_requests(assigned_admin_id) WHERE assigned_admin_id IS NOT NULL;

INSERT INTO schema_migrations(version) VALUES ('024_support_assignment') ON CONFLICT DO NOTHING;
COMMIT;
