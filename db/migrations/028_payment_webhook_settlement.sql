-- INBOX9 P0: provider-neutral payment webhook idempotency and settlement ledger.
BEGIN;

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('payment.succeeded','payment.failed')),
  payload_hash TEXT NOT NULL,
  recharge_id TEXT NOT NULL REFERENCES recharge_requests(id) ON DELETE CASCADE,
  observed_amount_paise BIGINT NOT NULL CHECK (observed_amount_paise > 0),
  currency TEXT NOT NULL CHECK (currency = 'INR'),
  observed_utr TEXT,
  external_reference TEXT,
  status TEXT NOT NULL CHECK (status IN ('Received','Processed','Rejected','Ignored')),
  outcome TEXT,
  error_code TEXT,
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_recharge_received
  ON payment_webhook_events(recharge_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_status_received
  ON payment_webhook_events(status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_hash
  ON payment_webhook_events(payload_hash);

INSERT INTO schema_migrations(version)
VALUES ('028_payment_webhook_settlement')
ON CONFLICT DO NOTHING;

COMMIT;
