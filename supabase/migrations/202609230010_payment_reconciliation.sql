-- INBOX9 Issue 5: payment/UTR reconciliation and financial review trail
BEGIN;

CREATE TABLE IF NOT EXISTS payment_reconciliation_events (
  id TEXT PRIMARY KEY,
  recharge_id TEXT NOT NULL REFERENCES recharge_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('submitted','verified','approved','rejected','flagged')),
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  observed_amount_paise BIGINT,
  observed_utr TEXT,
  external_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_recon_recharge_created
  ON payment_reconciliation_events(recharge_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_recon_type_created
  ON payment_reconciliation_events(event_type, created_at DESC);

ALTER TABLE recharge_requests
  ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS flagged_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS flag_reason TEXT,
  ADD COLUMN IF NOT EXISTS verified_amount_paise BIGINT,
  ADD COLUMN IF NOT EXISTS verified_utr TEXT,
  ADD COLUMN IF NOT EXISTS external_reference TEXT;

CREATE INDEX IF NOT EXISTS idx_recharge_flagged
  ON recharge_requests(flagged_at DESC) WHERE flagged_at IS NOT NULL;

INSERT INTO schema_migrations(version) VALUES ('010_payment_reconciliation') ON CONFLICT DO NOTHING;
COMMIT;
