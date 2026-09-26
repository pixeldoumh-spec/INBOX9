-- Production provider catalog and explicit service-code mapping.
BEGIN;

CREATE TABLE IF NOT EXISTS provider_service_mappings (
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  provider_service_code TEXT NOT NULL CHECK (length(trim(provider_service_code)) > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_service_mappings_service_active
  ON provider_service_mappings(service_id, active, provider_id);

INSERT INTO providers (id,name,adapter_key,active,priority)
VALUES
  ('provider-asms','ASMS.ai','asms',FALSE,20),
  ('provider-pvapins','PVAPins','pvapins',FALSE,30),
  ('provider-svnumber','SMS Verification Number','sms-verification-number',FALSE,40)
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name,
  adapter_key=EXCLUDED.adapter_key,
  priority=EXCLUDED.priority,
  updated_at=NOW();

INSERT INTO schema_migrations(version)
VALUES ('041_production_provider_catalog')
ON CONFLICT DO NOTHING;

COMMIT;
