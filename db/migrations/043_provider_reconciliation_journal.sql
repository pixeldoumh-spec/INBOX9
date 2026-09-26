CREATE TABLE IF NOT EXISTS provider_reconciliation_runs (
  id UUID PRIMARY KEY,
  trigger TEXT NOT NULL CHECK (trigger IN ('cron','manual')),
  status TEXT NOT NULL CHECK (status IN ('Running','Succeeded','Failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancellation_processed INTEGER NOT NULL DEFAULT 0,
  expiration_processed INTEGER NOT NULL DEFAULT 0,
  wallet_reconciliation_processed INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS provider_reconciliation_events (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES provider_reconciliation_runs(id) ON DELETE CASCADE,
  operation_id TEXT,
  activation_id TEXT,
  provider_id TEXT,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  safe_to_retry BOOLEAN NOT NULL DEFAULT FALSE,
  error_code TEXT,
  error_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_reconciliation_runs_started
  ON provider_reconciliation_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_reconciliation_events_run
  ON provider_reconciliation_events(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_reconciliation_events_activation
  ON provider_reconciliation_events(activation_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_reconciliation_running
  ON provider_reconciliation_runs(status)
  WHERE status='Running';
