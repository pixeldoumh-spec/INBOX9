-- INBOX9 Issue 8: session lifecycle hardening
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS session_version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

UPDATE sessions s
SET session_version = u.session_version
FROM users u
WHERE u.id = s.user_id
  AND s.session_version = 1
  AND u.session_version <> 1;

CREATE INDEX IF NOT EXISTS idx_sessions_user_created_desc
  ON sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_cleanup
  ON sessions(expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_user_revoked
  ON sessions(user_id, revoked_at, created_at DESC);

INSERT INTO schema_migrations(version) VALUES ('012_auth_session_hardening') ON CONFLICT DO NOTHING;
COMMIT;
