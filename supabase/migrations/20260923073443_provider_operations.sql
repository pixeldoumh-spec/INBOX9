-- INBOX9 Issue 2: durable provider operations for cancellation/reconciliation
BEGIN;

ALTER TABLE activations DROP CONSTRAINT IF EXISTS activations_status_check;
ALTER TABLE activations ADD CONSTRAINT activations_status_check CHECK (status IN ('Active','CancellationPending','Completed','Expired','Refunded','Cancelled'));

CREATE TABLE IF NOT EXISTS provider_operations (
  id TEXT PRIMARY KEY,
  activation_id TEXT NOT NULL REFERENCES activations(id),
  operation_type TEXT NOT NULL CHECK (operation_type IN ('cancel','status_sync')),
  status TEXT NOT NULL CHECK (status IN ('Pending','Succeeded','Failed')),
  provider_id TEXT REFERENCES providers(id),
  provider_activation_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_operation_active
  ON provider_operations(activation_id, operation_type)
  WHERE status = 'Pending';
CREATE INDEX IF NOT EXISTS idx_provider_operations_pending
  ON provider_operations(status, updated_at)
  WHERE status = 'Pending';

INSERT INTO schema_migrations(version) VALUES ('007_provider_operations') ON CONFLICT DO NOTHING;
COMMIT;
