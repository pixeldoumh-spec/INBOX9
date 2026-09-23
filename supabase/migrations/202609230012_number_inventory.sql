-- INBOX9 Sprint 12: provider-owned inbound number inventory.
-- This stores only numbers that INBOX9 is contractually authorized to use.
BEGIN;

CREATE TABLE IF NOT EXISTS number_inventory (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  provider_number_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  country CHAR(2) NOT NULL DEFAULT 'IN',
  region TEXT,
  number_type TEXT,
  sms_capable BOOLEAN NOT NULL DEFAULT FALSE,
  voice_capable BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL CHECK (status IN ('available','reserved','active','cooldown','disabled')) DEFAULT 'available',
  assigned_service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
  reserved_for_activation_id TEXT REFERENCES activations(id) ON DELETE SET NULL,
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider_id, provider_number_id),
  UNIQUE(provider_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_number_inventory_available
  ON number_inventory(country, status, assigned_service_id)
  WHERE status='available' AND sms_capable=TRUE;
CREATE INDEX IF NOT EXISTS idx_number_inventory_provider_sync
  ON number_inventory(provider_id, last_synced_at DESC);

ALTER TABLE number_inventory ENABLE ROW LEVEL SECURITY;

-- Inventory is server-side operational data. No direct anon/authenticated access.
REVOKE ALL ON TABLE number_inventory FROM anon, authenticated;

INSERT INTO schema_migrations(version) VALUES ('012_number_inventory') ON CONFLICT DO NOTHING;
COMMIT;
