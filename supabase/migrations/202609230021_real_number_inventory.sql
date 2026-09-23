-- INBOX9: durable inventory for provider-assigned Indian numbers and inbound SMS.
BEGIN;

CREATE TABLE IF NOT EXISTS number_inventory (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  provider_number_id TEXT NOT NULL,
  phone_number TEXT NOT NULL CHECK (phone_number ~ '^\\+91[6-9][0-9]{9}$'),
  country CHAR(2) NOT NULL DEFAULT 'IN' CHECK (country = 'IN'),
  region TEXT,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('Available','Reserved','Active','Suspended','Released'))
    DEFAULT 'Available',
  activation_id TEXT REFERENCES activations(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_key, provider_number_id),
  UNIQUE (source_key, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_number_inventory_available
  ON number_inventory(source_key, status, updated_at DESC)
  WHERE status = 'Available';

CREATE INDEX IF NOT EXISTS idx_number_inventory_country_status
  ON number_inventory(country, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_number_inventory_activation
  ON number_inventory(activation_id)
  WHERE activation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_number_inventory_last_synced
  ON number_inventory(source_key, last_synced_at DESC);

CREATE TABLE IF NOT EXISTS number_sms_messages (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  number_inventory_id TEXT NOT NULL REFERENCES number_inventory(id) ON DELETE CASCADE,
  provider_message_id TEXT NOT NULL,
  from_number TEXT,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4096),
  otp_code TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_key, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_number_sms_number_received
  ON number_sms_messages(number_inventory_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_number_sms_expiry
  ON number_sms_messages(expires_at);

ALTER TABLE public.number_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.number_sms_messages ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_migrations(version)
VALUES ('021_real_number_inventory')
ON CONFLICT DO NOTHING;

COMMIT;
