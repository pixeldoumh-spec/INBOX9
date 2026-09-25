-- INBOX9 Issue 3: durable activation request idempotency
BEGIN;

CREATE TABLE IF NOT EXISTS activation_idempotency (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Processing','Completed','Failed')),
  activation_id TEXT REFERENCES activations(id) ON DELETE SET NULL,
  response_json JSONB,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_activation_idempotency_expires
  ON activation_idempotency(expires_at);
CREATE INDEX IF NOT EXISTS idx_activation_idempotency_activation
  ON activation_idempotency(activation_id)
  WHERE activation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activation_idempotency_processing
  ON activation_idempotency(status, updated_at)
  WHERE status='Processing';

INSERT INTO schema_migrations(version) VALUES ('008_activation_idempotency') ON CONFLICT DO NOTHING;
COMMIT;
