-- INBOX9 Sprint 4: provider registry, routing and provider-owned activation identifiers
BEGIN;
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  adapter_key TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS service_provider_routes (
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (service_id, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_routes_service_priority ON service_provider_routes(service_id, priority) WHERE active=TRUE;
ALTER TABLE activations ADD COLUMN IF NOT EXISTS provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL;
ALTER TABLE activations ADD COLUMN IF NOT EXISTS provider_activation_id TEXT;
ALTER TABLE activations ADD COLUMN IF NOT EXISTS provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS uq_activation_provider_ref ON activations(provider_id, provider_activation_id) WHERE provider_id IS NOT NULL AND provider_activation_id IS NOT NULL;
INSERT INTO providers (id,name,adapter_key,priority) VALUES ('provider-mock','INBOX9 Mock Provider','mock',100)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, adapter_key=EXCLUDED.adapter_key, active=TRUE, updated_at=NOW();
INSERT INTO service_provider_routes(service_id,provider_id,priority)
SELECT s.id,'provider-mock',100 FROM services s
ON CONFLICT (service_id,provider_id) DO UPDATE SET active=TRUE, priority=100;
INSERT INTO schema_migrations(version) VALUES ('004_providers') ON CONFLICT DO NOTHING;
COMMIT;
