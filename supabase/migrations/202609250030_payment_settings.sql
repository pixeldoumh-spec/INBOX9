BEGIN;

CREATE TABLE IF NOT EXISTS payment_settings (
  id TEXT PRIMARY KEY CHECK (id='default'),
  upi_id TEXT,
  merchant_name TEXT NOT NULL DEFAULT 'INBOX9',
  instructions TEXT NOT NULL DEFAULT 'Pay the exact amount and keep the UTR / transaction reference.',
  qr_image TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payment_settings_updated_at
  ON payment_settings(updated_at DESC);

INSERT INTO payment_settings(id,upi_id,merchant_name,instructions)
VALUES ('default',NULL,'INBOX9','Pay the exact amount and keep the UTR / transaction reference.')
ON CONFLICT (id) DO NOTHING;

COMMIT;
