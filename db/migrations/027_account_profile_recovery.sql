BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_id TEXT;
UPDATE sessions SET session_id='SES-' || substr(md5(token_hash || created_at::text),1,24) WHERE session_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_session_id ON sessions(session_id);
ALTER TABLE sessions ALTER COLUMN session_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_created ON recovery_codes(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_unused ON recovery_codes(user_id,used_at) WHERE used_at IS NULL;
INSERT INTO schema_migrations(version) VALUES ('027_account_profile_recovery') ON CONFLICT DO NOTHING;
COMMIT;